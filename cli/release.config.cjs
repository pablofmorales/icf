module.exports = {
  branches: ["main"],
  plugins: [
    ["@semantic-release/commit-analyzer", {
      preset: "conventionalcommits",
      releaseRules: [
        { type: "feat",   release: "minor" },
        { type: "fix",    release: "patch" },
        { type: "perf",   release: "patch" },
        { type: "revert", release: "patch" },
        { type: "docs",   release: "patch" },
      ],
      parserOpts: { noteKeywords: ["BREAKING CHANGE", "BREAKING CHANGES"] },
    }],
    ["@semantic-release/release-notes-generator", {
      preset: "conventionalcommits",
      presetConfig: {
        types: [
          { type: "feat",     section: "🚀 Features"       },
          { type: "fix",      section: "🐛 Bug Fixes"      },
          { type: "perf",     section: "⚡ Performance"     },
          { type: "docs",     section: "📚 Documentation", hidden: false },
          { type: "chore",    section: "🔧 Maintenance",   hidden: true  },
          { type: "ci",       section: "👷 CI",            hidden: true  },
          { type: "refactor", section: "♻️ Refactoring",   hidden: true  },
        ],
      },
    }],
    ["@semantic-release/changelog", { changelogFile: "CHANGELOG.md" }],
    ["@semantic-release/exec",      { prepareCmd: "npm run build" }],
    // Security fix #18: publish with provenance so consumers can verify the
    // published artifact was built from this exact source commit.
    // Requires id-token: write in the workflow (already present).
    ["@semantic-release/npm",       { npmPublish: true, pkgRoot: ".", npmPublishOptions: ["--provenance"] }],
    ["@semantic-release/github",    { addReleases: "bottom", successComment: false, failComment: false }],
    ["@semantic-release/git", {
      assets: ["package.json", "package-lock.json", "CHANGELOG.md"],
      message: "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
    }],
  ],
};
