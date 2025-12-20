#!/usr/bin/env bash

docker run --rm -it -v ~/.aws:/root/.aws az2aws/az2aws "$@"
