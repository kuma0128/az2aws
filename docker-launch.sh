#!/usr/bin/env bash

docker run --rm -it -v ~/.aws:/root/.aws taiseiito1000/az2aws "$@"
