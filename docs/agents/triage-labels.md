# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Project `Status`  | Meaning                                  |
| -------------------------- | -------------------- | ----------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | `Needs triage`    | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | `Needs info`      | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | `Ready for agent` | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | `Ready for human` | Requires human implementation            |
| `wontfix`                  | `wontfix`            | `Won't fix`       | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table and set the matching Project `Status` when the issue is in the `Stasium` Project.

Issues with no triage label should usually be placed in `Needs triage`. Use `In progress` for actively owned work and `Done` for completed Project items.
