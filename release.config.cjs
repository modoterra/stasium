module.exports = {
  branches: ["main"],
  plugins: [
    ["@semantic-release/commit-analyzer", { preset: "conventionalcommits" }],
    ["@semantic-release/release-notes-generator", { preset: "conventionalcommits" }],
    ["@semantic-release/changelog", { changelogFile: "CHANGELOG.md" }],
    [
      "@semantic-release/git",
      {
        assets: ["CHANGELOG.md"],
        message: "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
    [
      "@semantic-release/github",
      {
        successComment: false,
        failComment: false,
        releasedLabels: false,
        assets: [
          {
            path: "release/stasium-ubuntu-latest/stasium",
            name: "stasium-linux",
            label: "stasium-linux",
          },
          {
            path: "release/stasium-macos-latest/stasium",
            name: "stasium-macos",
            label: "stasium-macos",
          },
          {
            path: "release/stasium-windows-latest/stasium.exe",
            name: "stasium-windows.exe",
            label: "stasium-windows",
          },
        ],
      },
    ],
  ],
};
