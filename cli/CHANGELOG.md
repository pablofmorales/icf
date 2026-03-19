## [1.2.0](https://github.com/BlackAsteroid/icf/compare/v1.1.0...v1.2.0) (2026-03-19)

### 🚀 Features

* JSON agent compatibility (ticket [#3](https://github.com/BlackAsteroid/icf/issues/3)) ([127bf1b](https://github.com/BlackAsteroid/icf/commit/127bf1b6cac596fb9bda8631bb9a8fb4e9d26da9))
* pre-configured token URL + icf init full repo bootstrap ([e9aba66](https://github.com/BlackAsteroid/icf/commit/e9aba666a076130fd9956c328bcdfcc52c319f82)), closes [#4](https://github.com/BlackAsteroid/icf/issues/4) [#5](https://github.com/BlackAsteroid/icf/issues/5) [#4](https://github.com/BlackAsteroid/icf/issues/4) [#5](https://github.com/BlackAsteroid/icf/issues/5)

### 🐛 Bug Fixes

* BUG-01 --version --json, BUG-02 empty --input-json, ticket [#5](https://github.com/BlackAsteroid/icf/issues/5) 404 handling ([ac01b80](https://github.com/BlackAsteroid/icf/commit/ac01b80a6a19c76d712eaa41e7ba268cb50d35ef)), closes [#7](https://github.com/BlackAsteroid/icf/issues/7) [#8](https://github.com/BlackAsteroid/icf/issues/8) [#7](https://github.com/BlackAsteroid/icf/issues/7) [#8](https://github.com/BlackAsteroid/icf/issues/8)

## [1.1.0](https://github.com/BlackAsteroid/icf/compare/v1.0.0...v1.1.0) (2026-03-19)

### 🚀 Features

* migrate to BlackAsteroid/icf repo ([2353b68](https://github.com/BlackAsteroid/icf/commit/2353b6845893e12ed5f778bab872a9b78c91e72b))

## 1.0.0 (2026-03-19)

### 🚀 Features

* icf upgrade command + npm publish setup + semantic-release CI ([d2eb206](https://github.com/BlackAsteroid/icf/commit/d2eb2061a87595823b4a6cbcd7580aa06bf1acf6))
* ICF v0.1.0 — M0 + M1 foundation ([42b6ac3](https://github.com/BlackAsteroid/icf/commit/42b6ac380ae0bd9dc11d26679756f32cb9e1e217))

### 🐛 Bug Fixes

* add issues:write permission to incident-triage workflow ([8a97976](https://github.com/BlackAsteroid/icf/commit/8a97976b7507d037b8e57f2bbb68af211cf5acc9))
* BUG-01 confirmed working + BUG-02 suppress Octokit request logs ([2c4c3d7](https://github.com/BlackAsteroid/icf/commit/2c4c3d7363c02a421f63a779f72d74cef386b92d))
* **ci:** add issues: write permission to Incident Escalation workflow ([98eeaf6](https://github.com/BlackAsteroid/icf/commit/98eeaf67821d08727b7790d9aaedfc784c4270e2))
* icf init requires --create flag for new repositories ([4f86014](https://github.com/BlackAsteroid/icf/commit/4f860147bcd9988e43c317593bcb870f1984d026))
* Jawad QA findings — filter validation, error sanitization, RCA prompt ([8473a1d](https://github.com/BlackAsteroid/icf/commit/8473a1d36e9063cc9f366d4f2a0268a6ec4d2103))
* remove duplicate 'if' key causing workflow parse failure ([b011f93](https://github.com/BlackAsteroid/icf/commit/b011f93e2bc9a3ca8c7f6259613b45068b929ac9))
* security hardening on workflows (Gerard review) ([876ccc2](https://github.com/BlackAsteroid/icf/commit/876ccc2a98c0256af7c6663af801ba1a6393c694)), closes [#1](https://github.com/BlackAsteroid/icf/issues/1) [#2](https://github.com/BlackAsteroid/icf/issues/2) [#4](https://github.com/BlackAsteroid/icf/issues/4)
* **security:** prevent fork PRs from accessing secrets in pr-review workflow ([7b7bde3](https://github.com/BlackAsteroid/icf/commit/7b7bde3dc7842c5b918ad345bb66f49989615fcb))
* **security:** service name validation + SECURITY.md ([4c55f6d](https://github.com/BlackAsteroid/icf/commit/4c55f6d4b1519f55b4158ae82c14b3ba3943cbad))
* tighten repo existence check to 404-only in icf init ([e8575e0](https://github.com/BlackAsteroid/icf/commit/e8575e08a65bf24aa072b04c2ef9ba4da19285dd))

### 📚 Documentation

* add ICF README ([4e31079](https://github.com/BlackAsteroid/icf/commit/4e31079cfff3c47207a14cebdeab862cb55bf29f))
* add README with quick start and command reference ([c2d1bbd](https://github.com/BlackAsteroid/icf/commit/c2d1bbdd4231622641e1edb84b9ff112faf0d01e))

# Changelog

All notable changes are documented here. Auto-maintained by [semantic-release](https://github.com/semantic-release/semantic-release).
