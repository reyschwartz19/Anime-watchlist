# Installed design skills

Verified on 2026-11-04. Both installers ran from this repository, at project scope for Codex. The working tree was clean before this task; existing application files were not changed by these installations.

| Skill | Installed entry point | Skill version | Installer |
| --- | --- | --- | --- |
| Paul Bakaus / Impeccable | `.agents/skills/impeccable/SKILL.md` | 4.8.0 | `impeccable` npm 4.8.0, native engine 0.1.18 |
| Vercel Labs / web-design-guidelines | `.agents/skills/web-design-guidelines/SKILL.md` | 1.0.0 | `skills` npm 1.7.6 |

Both upstream READMEs and CLI help were read **before installation**. Snapshots and command transcripts are in this directory. The exact requested commands completed with exit code 0:

```sh
npx impeccable install --providers=codex --scope=project --no-hooks
npx skills add vercel-labs/agent-skills --skill web-design-guidelines --agent codex
```

The sandbox mounts `.agents` and `.codex` read-only. The authorized installer commands therefore ran with sandbox escalation.

The Impeccable npm launcher initially lacked its optional native binary. Its documented `IMPECCABLE_BIN` mechanism was used with the matching published `@impeccable/cli-linux-x64@0.1.18` package in `/tmp`. The installer subsequently installed the verified native engine inside `.agents/skills/impeccable/scripts/bin/linux-x64/`; normal project use no longer needs that environment variable. Its SHA-256 matches the publisher's included engine-checksum manifest. No hooks were installed. No global skill installation was performed.

## Provenance

The installed `SKILL.md` files were compared byte for byte against these pinned upstream files:

- [Impeccable at `5af4319c4e7a7ee3e5e2b9fe899bcfb21c6190cb`](https://github.com/pbakaus/impeccable/blob/5af4319c4e7a7ee3e5e2b9fe899bcfb21c6190cb/.agents/skills/impeccable/SKILL.md).
- [web-design-guidelines at `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62`](https://github.com/vercel-labs/agent-skills/blob/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/web-design-guidelines/SKILL.md).

The [machine-readable manifest](installed-skills.json) records versions, paths, commits, SHA-256 digests, and the Vercel CLI's `skills-lock.json` hash. Matching a `SKILL.md` to a commit verifies that file's provenance; it does not assert the complete distribution was built from that commit.

## Codex reload

Reload or restart Codex after installation. The [Impeccable upstream README](https://github.com/pbakaus/impeccable/blob/5af4319c4e7a7ee3e5e2b9fe899bcfb21c6190cb/README.md) explicitly says to reload the coding tool. After reload, check `/skills` or invoke `$impeccable`. Vercel's upstream README says installed skills are automatically available. The current task can read the installed instructions directly for its critique and interaction audit without waiting for a restart.

## Review workflow

Read the project design docs and captured reference evidence before making UI changes. Use Impeccable's `reference/critique.md` for the implemented mockup's critique. Use Vercel's installed skill for its interaction audit; it requires fetching fresh [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) before each review. A fetched snapshot is included here as evidence, not a substitute for that freshness requirement in later reviews.
