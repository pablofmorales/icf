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
    ["@semantic-release/npm",       { npmPublish: true, pkgRoot: "." }],
    ["@semantic-release/github",    { addReleases: "bottom", successComment: false, failComment: false }],
    ["@semantic-release/git", {
      assets: ["package.json", "package-lock.json", "CHANGELOG.md"],
      message: "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
    }],
  ],
};
