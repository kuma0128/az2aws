#!/bin/sh

set -eu

# Before 2.3.0 the image ran as root and was started with ~/.aws mounted at
# /root/.aws. That directory is unreadable to the non-root user, so fail with
# migration guidance instead of reporting an unknown profile or configuring
# into the container's ephemeral home directory.
if awk '$5 == "/root/.aws" { found = 1 } END { exit !found }' \
    /proc/self/mountinfo 2>/dev/null; then
    cat >&2 <<'EOF'
az2aws 2.3.0 and later run as a non-root user and no longer read /root/.aws.
Install docker-launch.sh from v2.3.0 or later and set up the profiles you need
in its dedicated directory: https://github.com/kuma0128/az2aws#docker
EOF
    exit 1
fi

exec node /az2aws/lib "$@"
