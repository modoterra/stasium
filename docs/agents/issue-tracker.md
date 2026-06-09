# Issue tracker: GitHub Issues + GitHub Project

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

Newly created issues and PRDs must also be added to the `Stasium` GitHub Project:

- Project owner: `modoterra`
- Project number: `1`
- Project URL: `https://github.com/orgs/modoterra/projects/1`

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use `--body-file` for multi-line bodies and capture the printed issue URL.
- **Add created issue to Project**: `gh project item-add 1 --owner modoterra --url "$ISSUE_URL"`, where `$ISSUE_URL` is the URL returned by `gh issue create`.
- **Set Project status**: use the Project `Status` field after adding the item. See the status workflow below.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` -- `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue, then add it to the `Stasium` GitHub Project.

Preferred command shape:

```sh
ISSUE_URL=$(gh issue create --title "..." --body-file /tmp/issue-body.md)
gh project item-add 1 --owner modoterra --url "$ISSUE_URL"
```

For multiple issues, repeat both steps for each issue. Do not leave newly created issues outside the Project unless the user explicitly asks for GitHub Issues only.

## Project status workflow

Use the `Status` field in the `Stasium` Project to show workflow state:

| Status           | Use when                                               |
| ---------------- | ------------------------------------------------------ |
| `Todo`           | Queued for delivery                                    |
| `In Progress`    | Actively owned work                                    |
| `In Review`      | PR exists and is awaiting review or checks             |
| `Ready to Merge` | PR is self-reviewed and all agent-runnable checks pass |
| `Done`           | Completed or merged work                               |
| `Blocked`        | Delivery cannot continue until a blocker is resolved   |

When creating issues from a PRD or plan, apply the `ready-for-agent` label only if the issue is independently grabbable and has enough acceptance criteria. Otherwise apply `needs-triage` or `needs-info`. Use Project `Status` for delivery progress only.

To set a Project item status, fetch the Project item ID and option IDs, then update the `Status` field:

```sh
gh api graphql -f query='query {
  organization(login: "modoterra") {
    projectV2(number: 1) {
      id
      fields(first: 20) {
        nodes {
          ... on ProjectV2SingleSelectField {
            id
            name
            options { id name }
          }
        }
      }
      items(first: 100) {
        nodes {
          id
          content { ... on Issue { number title } }
        }
      }
    }
  }
}'

gh api graphql -f query='mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "PROJECT_ID",
    itemId: "ITEM_ID",
    fieldId: "STATUS_FIELD_ID",
    value: { singleSelectOptionId: "STATUS_OPTION_ID" }
  }) { projectV2Item { id } }
}'
```

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
