# Contributing

## Get started

This project is written in TypeScript and is using prettier and eslint for code formatting. You need node v22.

1. Install [mise](https://mise.jdx.dev/) (runtime version manager):

```sh
curl https://mise.run | sh
```

2. Activate mise in your shell. Add the following to your shell configuration file:

```sh
echo 'eval "$(~/.local/bin/mise activate zsh)"' >> ~/.zshrc
```

Then restart your shell or run `source ~/.zshrc` (or the appropriate config file for your shell, such as `~/.bashrc`).

3. Install Node.js v22:

```sh
mise use --global node@22
```

4. Verify Node.js version (should return v22.x.x):

```sh
node -v
```

5. Install yarn:

```sh
npm install -g yarn
```

6. Fork and clone project:

```sh
git clone git@github.com:<GITHUB_USERNAME>/az2aws.git
cd az2aws
```

7. Install dependencies:

```sh
yarn install
```

8a. Start dev mode:

```sh
yarn start
```

8b. Start prod mode:

```sh
yarn build && node ./lib/index.js
```
