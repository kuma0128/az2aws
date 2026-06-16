# Changelog

## [1.9.1](https://github.com/kuma0128/az2aws/compare/v1.9.0...v1.9.1) (2026-06-16)


### Bug Fixes

* **deps:** bump commander from 14.0.3 to 15.0.0 ([f07f11b](https://github.com/kuma0128/az2aws/commit/f07f11b82cdfffb9b990c8058f4b2a01e3bcf35b))

## [1.9.0](https://github.com/kuma0128/az2aws/compare/v1.8.1...v1.9.0) (2026-05-21)


### Features

* Enable Stay logged in by default ([#222](https://github.com/kuma0128/az2aws/issues/222)) ([7c027dc](https://github.com/kuma0128/az2aws/commit/7c027dcad1b5d40b35e74e39844d2157137468e8))
* suggest gui mode when cli login stalls ([#215](https://github.com/kuma0128/az2aws/issues/215)) ([f4a5850](https://github.com/kuma0128/az2aws/commit/f4a58504b0802d39781abf2352f70a81248ac08e))
* support azaws-compatible profiles ([#214](https://github.com/kuma0128/az2aws/issues/214)) ([20f1ecb](https://github.com/kuma0128/az2aws/commit/20f1ecbb0926f24bb6bba166b97eb10b39d91c95))

## [1.8.1](https://github.com/kuma0128/az2aws/compare/v1.8.0...v1.8.1) (2026-05-07)


### Bug Fixes

* **update-notifier:** shorten cache TTL to 6 hours ([#207](https://github.com/kuma0128/az2aws/issues/207)) ([4112845](https://github.com/kuma0128/az2aws/commit/411284573c6609832ec63914f7cfc2ff44eb2340))

## [1.8.0](https://github.com/kuma0128/az2aws/compare/v1.7.0...v1.8.0) (2026-04-27)


### Features

* show saved credential usage details ([#206](https://github.com/kuma0128/az2aws/issues/206)) ([04855cf](https://github.com/kuma0128/az2aws/commit/04855cf18e42f84ec2d639c825b0b6233730c3a0))


### Bug Fixes

* **login:** retry managed profile reset on Windows lock errors ([#199](https://github.com/kuma0128/az2aws/issues/199)) ([a4ad1c7](https://github.com/kuma0128/az2aws/commit/a4ad1c76d0f193cee16f17319e47449c6b5cba44))
* **login:** skip non-az2aws profiles in --all-profiles ([#196](https://github.com/kuma0128/az2aws/issues/196)) ([0dc6820](https://github.com/kuma0128/az2aws/commit/0dc6820775ebf03637dda78a899e0e2c16c25561))
* outdated references in README and docker-launch.sh ([#192](https://github.com/kuma0128/az2aws/issues/192)) ([79421ae](https://github.com/kuma0128/az2aws/commit/79421ae4c6c734cb81b37fde6a457e2b9c0752e8))


### Performance Improvements

* switch CI to Corepack and drop manual pnpm store cache ([a27b64c](https://github.com/kuma0128/az2aws/commit/a27b64c4183382a10618a6dfcae0ccf803261894))

## [1.7.0](https://github.com/kuma0128/az2aws/compare/v1.6.2...v1.7.0) (2026-04-13)


### Features

* add credential_process output mode ([#95](https://github.com/kuma0128/az2aws/issues/95)) ([2a3e66f](https://github.com/kuma0128/az2aws/commit/2a3e66fcd19fd461dd2f84fc32caa383fb56990c))
* add macOS CI coverage and separate E2E job ([#183](https://github.com/kuma0128/az2aws/issues/183)) ([cf617f8](https://github.com/kuma0128/az2aws/commit/cf617f899b5d2ba88650f7ffd26c3195dc32c695))
* Use Windows app-data conventions for update notifier cache ([#180](https://github.com/kuma0128/az2aws/issues/180)) ([8383ae4](https://github.com/kuma0128/az2aws/commit/8383ae46a468630ce531cc9df0dd7d64f115e49c))


### Bug Fixes

* --no-prompt on account selection screen ([#173](https://github.com/kuma0128/az2aws/issues/173)) ([07c833f](https://github.com/kuma0128/az2aws/commit/07c833ff8a4553b8c32ed7841b3544776c41f907))
* clear password input before typing to prevent appending ([#171](https://github.com/kuma0128/az2aws/issues/171)) ([dfb0d65](https://github.com/kuma0128/az2aws/commit/dfb0d65c85fdb3a38bbc2d6ccdbd492f18e97c25))
* enforce whole number validation for session duration hours ([#167](https://github.com/kuma0128/az2aws/issues/167)) ([0bc7fb4](https://github.com/kuma0128/az2aws/commit/0bc7fb4f187dad422f08a42ece57a4b04138c51d))
* PATH handling when installing Chrome in CI workflow ([#184](https://github.com/kuma0128/az2aws/issues/184)) ([f6fd008](https://github.com/kuma0128/az2aws/commit/f6fd008a65f7c722b78ae65121e1e20f421dc232))
* support custom AWS config parent directories ([#172](https://github.com/kuma0128/az2aws/issues/172)) ([19753dd](https://github.com/kuma0128/az2aws/commit/19753dd769f31a72b4e0bdb84acf9638c1cd67f7))

## [1.6.2](https://github.com/kuma0128/az2aws/compare/v1.6.1...v1.6.2) (2026-04-10)


### Bug Fixes

* **deps:** remove unnecessary dependency for security hardening ([#156](https://github.com/kuma0128/az2aws/issues/156)) ([b1ac64d](https://github.com/kuma0128/az2aws/commit/b1ac64d358197db094603dbc948c5f49cfa78c88))

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
