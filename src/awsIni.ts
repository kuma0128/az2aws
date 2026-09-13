import ini from "ini";

type AwsFileType = "config" | "credentials";

function logicalSectionName(header: string, type: AwsFileType): string {
  if (type === "credentials") return header;
  const match = header.match(/^(profile|sso-session|services)\s+(.*)$/);
  if (!match) return header;
  let name = match[2];
  if (name.startsWith('"') && name.endsWith('"')) {
    name = name.slice(1, -1).replace(/\\(["\\])/g, "$1");
  } else if (name.startsWith("'") && name.endsWith("'")) {
    name = name.slice(1, -1);
  } else {
    name = name.replace(/\\(.)/g, "$1");
  }
  return `${match[1]} ${name}`;
}

function sectionHeader(name: string, type: AwsFileType): string {
  if (/[\u0000-\u001f\u007f\]]/.test(name)) {
    throw new Error(
      "AWS section names cannot contain control characters or ']'",
    );
  }
  const match =
    type === "config" && name.match(/^(profile|sso-session|services) (.*)$/);
  if (match && /[\s"'\\]/.test(match[2])) {
    return `[${match[1]} "${match[2].replace(/["\\]/g, "\\$&")}"]`;
  }
  return `[${name}]`;
}

export function parseAwsIni(
  source: string,
  type: AwsFileType,
): Record<string, unknown> {
  // Shield section names from npm ini's dot nesting and comment handling.
  // AWS credential section names are literal; config profile names may be quoted.
  const names = new Map<string, string>();
  const encoded = source.replace(
    /^[ \t]*\[([^\]\r\n]+)\][^\r\n]*/gm,
    (_line, header: string) => {
      const placeholder = `az2awssection${names.size}`;
      names.set(placeholder, logicalSectionName(header, type));
      return `[${placeholder}]`;
    },
  );
  return Object.fromEntries(
    Object.entries(ini.parse(encoded)).map(([key, value]) => [
      names.get(key) ?? key,
      value,
    ]),
  );
}

function settingLine(key: string, value: unknown): string {
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(key)) {
    throw new Error("Invalid AWS setting name");
  }
  if (
    !["string", "number", "boolean"].includes(typeof value) ||
    /[\r\n\0]/.test(String(value))
  ) {
    throw new Error("AWS settings must be single-line scalar values");
  }
  // Azure-only values retain the historical ini escaping understood by our
  // reader. AWS consumes its own settings literally, including '=' in tokens.
  return key.startsWith("azure_")
    ? ini.stringify({ [key]: value }).trimEnd()
    : `${key}=${String(value)}`;
}

/** Edit one section without reserializing unrelated AWS configuration. */
export function updateAwsIni(
  source: string,
  sectionName: string,
  values: Record<string, unknown> | undefined,
  type: AwsFileType = "config",
): string {
  const header = sectionHeader(sectionName, type);
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/(?<=\n)/);
  const matches: number[] = [];
  let end = lines.length;
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^\s*(\[[^\]\r\n]+\])/);
    if (!match) continue;
    if (logicalSectionName(match[1].slice(1, -1), type) === sectionName)
      matches.push(index);
    else if (matches.length === 1 && end === lines.length) end = index;
  }
  if (matches.length > 1)
    throw new Error("Cannot update duplicate AWS profile sections");
  const start = matches[0];
  if (!values) {
    return start === undefined
      ? source
      : [...lines.slice(0, start), ...lines.slice(end)].join("");
  }
  const pending = new Map(Object.entries(values));
  // Validate everything before touching the file.
  for (const [key, value] of pending)
    if (value !== undefined) settingLine(key, value);
  if (start === undefined) {
    const additions = [...pending].filter(([, value]) => value !== undefined);
    if (!additions.length) return source;
    return (
      source +
      (source && !source.endsWith("\n") ? eol : "") +
      header +
      eol +
      additions.map(([key, value]) => settingLine(key, value) + eol).join("")
    );
  }

  const body = lines.slice(start + 1, end);
  const assignment = /^([ \t]*)([^\s#;=][^=]*?)\s*=/;
  const indents = body.flatMap((line) => {
    const match = line.match(assignment);
    return match ? [match[1].length] : [];
  });
  const baseIndent = Math.min(...indents);
  const basePrefix =
    body
      .map((line) => line.match(assignment))
      .find((match) => match && match[1].length === baseIndent)?.[1] ?? "";
  const updated: string[] = [];
  let replacedIndent: number | undefined;
  for (const line of body) {
    const match = line.match(assignment);
    const indent = line.match(/^[ \t]*/)![0].length;
    if (replacedIndent !== undefined && line.trim() && !/^\s*[#;]/.test(line)) {
      if (indent > replacedIndent) continue;
      replacedIndent = undefined;
    }
    const key = match?.[2].trim();
    if (
      match &&
      match[1].length === baseIndent &&
      key &&
      Object.prototype.hasOwnProperty.call(values, key)
    ) {
      if (pending.has(key) && pending.get(key) !== undefined) {
        updated.push(match[1] + settingLine(key, pending.get(key)) + eol);
      }
      pending.delete(key);
      replacedIndent = indent;
    } else updated.push(line);
  }
  if (updated.length && !updated[updated.length - 1].endsWith("\n"))
    updated.push(eol);
  for (const [key, value] of pending)
    if (value !== undefined)
      updated.push(basePrefix + settingLine(key, value) + eol);
  return [
    ...lines.slice(0, start + 1).map((line, index) => {
      const updatedLine =
        index === start ? line.replace(/^\s*\[[^\]]+\]/, header) : line;
      return updatedLine.endsWith("\n") ? updatedLine : updatedLine + eol;
    }),
    ...updated,
    ...lines.slice(end),
  ].join("");
}
