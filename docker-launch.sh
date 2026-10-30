#!/usr/bin/env bash

set -euo pipefail

if [[ "$(id -u)" == 0 ]]; then
    echo "Run docker-launch.sh as a non-root user." >&2
    exit 1
fi

# Share only the profiles explicitly configured for Docker, not all of ~/.aws.
aws_dir="${AZ2AWS_DOCKER_AWS_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/az2aws/docker}"
(umask 077; mkdir -p -- "$aws_dir")
aws_dir="$(cd -- "$aws_dir" && pwd -P)"

# Match the host owner so atomic config writes do not create root-owned files.
# /tmp is a writable, container-local home even when the host UID is not 1000.
docker_args=(run --rm -i --user "$(id -u):$(id -g)" --env HOME=/tmp
    --volume "$aws_dir:/tmp/.aws")
if [[ -t 0 && -t 1 ]]; then
    docker_args+=(-t)
fi

exec docker "${docker_args[@]}" taiseiito1000/az2aws "$@"
