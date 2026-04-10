# Changelog

## [1.6.1](https://github.com/kuma0128/az2aws/compare/v1.6.0...v1.6.1) (2026-04-02)


### Bug Fixes

* pin transitive security dependency versions ([#149](https://github.com/kuma0128/az2aws/issues/149)) ([cf224df](https://github.com/kuma0128/az2aws/commit/cf224dfaee28a8f1ef0a183c94ddf843d9b7d928))

## [1.6.0](https://github.com/kuma0128/az2aws/compare/v1.5.0...v1.6.0) (2026-03-17)


### Features

* add incognito mode option ([#97](https://github.com/kuma0128/az2aws/issues/97)) ([01d5f98](https://github.com/kuma0128/az2aws/commit/01d5f98897795eca9cef1b372284ac0a8c24b840))
* notify new available version ([#137](https://github.com/kuma0128/az2aws/issues/137)) ([c204bae](https://github.com/kuma0128/az2aws/commit/c204bae4ec57ea0b63d01d5d6c963951f8341318))


### Bug Fixes

* update dependencies and add Dependabot config ([#120](https://github.com/kuma0128/az2aws/issues/120)) ([c500dd0](https://github.com/kuma0128/az2aws/commit/c500dd06fd4c799bde467d069ec03ac244967542))
* update workflows to use pnpm cache and remove standalone option ([#119](https://github.com/kuma0128/az2aws/issues/119)) ([8d759c3](https://github.com/kuma0128/az2aws/commit/8d759c34d8d04211325cfba56692e2cbc55cfe51))

## [1.5.0](https://github.com/kuma0128/az2aws/compare/v1.4.0...v1.5.0) (2026-02-12)


### Features

* optimize Docker image build ([#105](https://github.com/kuma0128/az2aws/issues/105)) ([fc7f491](https://github.com/kuma0128/az2aws/commit/fc7f491a3d3029f3dbca750b984cbb3b5ea4bd3a))


### Bug Fixes

* handle TargetCloseError from incompatible browser profile ([#117](https://github.com/kuma0128/az2aws/issues/117)) ([d5c1752](https://github.com/kuma0128/az2aws/commit/d5c17521cd179891a13c8285d451ad353b47bc71))

## [1.4.0](https://github.com/kuma0128/az2aws/compare/v1.3.0...v1.4.0) (2026-02-12)


### Features

* add GovCloud region warning ([#104](https://github.com/kuma0128/az2aws/issues/104)) ([1e169cc](https://github.com/kuma0128/az2aws/commit/1e169cc77c35a5453728f71952aa4201842c8430))


### Bug Fixes

* honor http_proxy for browser and STS ([#92](https://github.com/kuma0128/az2aws/issues/92)) ([0e002ae](https://github.com/kuma0128/az2aws/commit/0e002ae362466cd9434bb364150bf54227738225))


### Performance Improvements

* optimize keyboard input clearing with select + backspace ([#116](https://github.com/kuma0128/az2aws/issues/116)) ([84b4cfb](https://github.com/kuma0128/az2aws/commit/84b4cfbef32917a6f6d2f9ef56d5a13b09a91f3a))
* replace lodash with native array methods ([#115](https://github.com/kuma0128/az2aws/issues/115)) ([f61786f](https://github.com/kuma0128/az2aws/commit/f61786f0ab1f215d351fe3ddba15d22cfb048198))

## [1.3.0](https://github.com/kuma0128/az2aws/compare/v1.2.0...v1.3.0) (2026-01-27)


### Features

* Add Comprehensive Loginstate Tests and Implementation ([#110](https://github.com/kuma0128/az2aws/issues/110)) ([09fce50](https://github.com/kuma0128/az2aws/commit/09fce501050731e2b0e5063ef8d2d5e4076827a1))


### Bug Fixes

* Apply Prettier formatting and add region logging to login functions ([#109](https://github.com/kuma0128/az2aws/issues/109)) ([26a5ef6](https://github.com/kuma0128/az2aws/commit/26a5ef636014f56ad77813f42e866a25b08be2f3))
* clarify session duration validation message ([#91](https://github.com/kuma0128/az2aws/issues/91)) ([22d87ec](https://github.com/kuma0128/az2aws/commit/22d87ec57318c6dc69d09e098d7e123d07df882e))
* correct typo 'occured' to 'occurred' in error message ([#86](https://github.com/kuma0128/az2aws/issues/86)) ([b0a75d2](https://github.com/kuma0128/az2aws/commit/b0a75d2c7cecaef7888d17a9880bcd63000713b8))
* enforce defaults for no-prompt role selection ([#90](https://github.com/kuma0128/az2aws/issues/90)) ([bea40f6](https://github.com/kuma0128/az2aws/commit/bea40f64a9dc6851b34a396fdd315752669c1d9d))

## [1.2.0](https://github.com/kuma0128/az2aws/compare/v1.1.3...v1.2.0) (2026-01-22)


### Features

* Add version flag to CLI command ([#67](https://github.com/kuma0128/az2aws/issues/67)) ([b89290f](https://github.com/kuma0128/az2aws/commit/b89290fe16d554f6a8a1bf09df0194a64d692b55))


### Bug Fixes

* Add default duration of 1 hour if parsing fails ([#70](https://github.com/kuma0128/az2aws/issues/70)) ([337d12c](https://github.com/kuma0128/az2aws/commit/337d12c90ab0eccf4034bd438ecfb2f0ad98db47))
* Fix SAML assertion decoding to use UTF-8 encoding ([#72](https://github.com/kuma0128/az2aws/issues/72)) ([14e44a7](https://github.com/kuma0128/az2aws/commit/14e44a7ffe19e48177078aa6d87feb7e8ecf0c94))
* resolve --no-verify-ssl and proxy settings conflict ([#73](https://github.com/kuma0128/az2aws/issues/73)) ([3fd9adf](https://github.com/kuma0128/az2aws/commit/3fd9adf6dd39109bb428b56215200ad1df3752a9))

## [1.1.3](https://github.com/kuma0128/az2aws/compare/v1.1.2...v1.1.3) (2026-01-19)


### Bug Fixes

* snapcraft deploy flow ([#65](https://github.com/kuma0128/az2aws/issues/65)) ([a4a41d7](https://github.com/kuma0128/az2aws/commit/a4a41d79c3142762f3d593796c8bf31b558bb8fe))

## [1.1.2](https://github.com/kuma0128/az2aws/compare/v1.1.1...v1.1.2) (2026-01-19)


### Bug Fixes

* snapcraft deploy flow ([#61](https://github.com/kuma0128/az2aws/issues/61)) ([48cff62](https://github.com/kuma0128/az2aws/commit/48cff6225ef79050137ad815f1dd5bacb4f9131f))
* Unreachable code in account selection logic ([#63](https://github.com/kuma0128/az2aws/issues/63)) ([eb1f0de](https://github.com/kuma0128/az2aws/commit/eb1f0de464ad5d991c82d2982abf9b0ffd9a7b49))

## [1.1.1](https://github.com/kuma0128/az2aws/compare/v1.1.0...v1.1.1) (2026-01-19)


### Bug Fixes

* update Snapcraft config to use npm plugin ([#59](https://github.com/kuma0128/az2aws/issues/59)) ([e574441](https://github.com/kuma0128/az2aws/commit/e57444187fc37460c3838d973c28563fe9e13913))

## [1.1.0](https://github.com/kuma0128/az2aws/compare/v1.0.2...v1.1.0) (2026-01-09)


### Features

* Add --disable-gpu ([#257](https://github.com/aws-azure-login/aws-azure-login/issues/257)) ([95f00d3](https://github.com/aws-azure-login/aws-azure-login/commit/95f00d345dd55b759e33963edd74fecf06ca40d5))


### Bug Fixes

* display authentication code ([#250](https://github.com/aws-azure-login/aws-azure-login/issues/250)) ([21574d0](https://github.com/aws-azure-login/aws-azure-login/commit/21574d056b935bc44a8f6585e443985679267a28))
* not printing authentication code when description message not match ([#363](https://github.com/aws-azure-login/aws-azure-login/issues/363)) ([8069ffe](https://github.com/aws-azure-login/aws-azure-login/commit/8069ffe2d9d0695fa5b7250dea5057834b308b8c))
