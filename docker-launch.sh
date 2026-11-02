#!/usr/bin/env bash

set -euo pipefail

if [[ "$(id -u)" == 0 ]]; then
    echo "Run docker-launch.sh as a non-root user." >&2
    exit 1
fi

# Share only the profiles explicitly configured for Docker, not all of ~/.aws.
aws_dir="${AZ2AWS_DOCKER_AWS_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/az2aws/docker}"
(umask 077; mkdir -p -- "$aws_dir")
aws_dir="$(CDPATH='' cd -- "$aws_dir" && pwd -P)"
if [[ ! -e "$aws_dir/config" ]]; then
    echo "az2aws: using $aws_dir for Docker AWS files; ~/.aws is not shared." \
        "See https://github.com/kuma0128/az2aws#docker" >&2
fi

# Match the host owner so atomic config writes do not create root-owned files.
# Rootless runtimes map container UIDs to subordinate host IDs instead: Podman
# can keep the caller's UID, and rootless Docker maps container root to it.
user_args=(--user "$(id -u):$(id -g)")
runtime_version="$(docker --version 2>/dev/null || true)"
if [[ "$runtime_version" == *[Pp]odman* ]]; then
    user_args=(--userns=keep-id "${user_args[@]}")
else
    security_options="$(docker info --format '{{.SecurityOptions}}' 2>/dev/null || true)"
    if [[ "$security_options" == *name=rootless* ]]; then
        user_args=(--user 0:0)
    fi
fi

# /tmp is a writable, container-local home even when the host UID is not 1000.
docker_args=(run --rm -i "${user_args[@]}" --env HOME=/tmp
    --volume "$aws_dir:/tmp/.aws")
if [[ -t 0 && -t 1 ]]; then
    docker_args+=(-t)
fi

# Docker's default seccomp profile, including rootless Docker's, blocks the
# user namespaces that Chrome's sandbox needs. Opt in only on runtimes known
# to allow them, such as Podman.
if [[ "${AZ2AWS_DOCKER_SANDBOX:-}" == 1 ]]; then
    exec docker "${docker_args[@]}" taiseiito1000/az2aws "$@"
fi
exec docker "${docker_args[@]}" taiseiito1000/az2aws --no-sandbox "$@"
