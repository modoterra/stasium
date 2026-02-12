module.exports = {
  branches: ["main"],
  plugins: [
    ["@semantic-release/commit-analyzer", { preset: "conventionalcommits" }],
    ["@semantic-release/release-notes-generator", { preset: "conventionalcommits" }],
    [
      "@semantic-release/github",
      {
        assets: [
          { path: "release/stasium-ubuntu-latest/stasium", label: "stasium-linux" },
          { path: "release/stasium-macos-latest/stasium", label: "stasium-macos" },
          { path: "release/stasium-windows-latest/stasium.exe", label: "stasium-windows" },
        ],
      },
    ],
  ],
};
