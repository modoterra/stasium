# Local Development Process Orchestration

Stasium helps a developer define, discover, run, observe, and shut down the local processes needed for a project.

## Language

**Managed Process**:
A named local process that Stasium can start, stop, restart, observe, and include in dependency ordering, whether it is launched directly or backed by Docker.
_Avoid_: Service, Task, Command, Process

**Direct Managed Process**:
A **Managed Process** launched directly by Stasium from a local process definition.
_Avoid_: Service, Local service

**Docker Managed Process**:
A **External Managed Process** Stasium can show and act on through Docker Compose.
_Avoid_: Docker service, Container

**External Managed Process**:
A **Managed Process** Stasium can show and act on through an **External Runtime** without owning its lifecycle.
_Avoid_: Externally Owned Managed Process, External service, Container, Pod

**Process Definition**:
A saved description of a **Direct Managed Process**, including its name, launch instruction, working directory, environment, restart rule, and dependencies.
_Avoid_: ServiceConfig, service block, entry, task

**Launch Instruction**:
The executable and arguments Stasium uses to start a **Direct Managed Process**.
_Avoid_: Command, Script, Shell command, Task

**Startup Dependency**:
A relationship requiring one **Managed Process** to be available before another is started.
_Avoid_: depends_on, Dependency, Prerequisite

**Manifest**:
The project-local file that records the **Process Definitions** Stasium owns directly.
_Avoid_: Config, Settings, stasium.toml when speaking conceptually

**Discovery**:
The process of inspecting a **Project** to propose **Process Definitions** for **Direct Managed Processes**.
_Avoid_: Detection, Scanning, Autoconfig

**Candidate**:
A proposed **Process Definition** produced by **Discovery** before **Candidate Selection** accepts it.
_Avoid_: DetectedCandidate, Suggestion, Generated service

**Candidate Selection**:
The developer's choice of which **Candidates** should become **Process Definitions**.
_Avoid_: Selection, DiscoverySelection, Finalization, Picking

**Process State**:
The current lifecycle condition Stasium reports for a **Managed Process**.
_Avoid_: Status, Mode, Health

**Restart Rule**:
The rule that determines whether Stasium should start a **Direct Managed Process** again after an unsuppressed exit.
_Avoid_: restart_policy, Policy, Auto-restart

**Process Output**:
Stdout and stderr text Stasium records or streams for a **Managed Process** during the active **Workspace**, including recent output supplied by an external runtime.
_Avoid_: Logs, LogBuffer, Console output

**Process Claim**:
Stasium's persistent record that a **Direct Managed Process** belongs to a **Project** and may be cleaned up by Stasium.
_Avoid_: PID file, PID record, Lock file

**Process Identity**:
The evidence Stasium uses to decide whether a live process matches a **Process Claim**.
_Avoid_: identityVerified, PID match, Safety check

**Workspace**:
The interactive view where a developer manages **Managed Processes**, **Process Output**, **Discovery**, and external runtime visibility after a **Manifest** exists.
_Avoid_: TUI, Dashboard, UI

**Project**:
The directory tree whose local development stack is managed by one **Manifest**.
_Avoid_: Repository, App, Working directory

**Startup**:
Stasium bringing a **Project**'s **Direct Managed Processes** toward running state according to their **Process Definitions**.
_Avoid_: Boot, Run all, Start all

**Shutdown**:
Stasium attempting to stop a **Project**'s **Direct Managed Processes**, release their **Process Claims** safely, and request stops for **External Managed Processes** tracked in the **External Runtime Session**.
_Avoid_: Quit, Exit, Cleanup

**Process Ownership**:
Stasium's authority to start, stop, restart, and clean up a **Managed Process**.
_Avoid_: Control, Management, Authority

**Development Stack**:
The set of **Managed Processes** a **Project** needs for local development.
_Avoid_: App stack, Services, Environment

**External Runtime Visibility**:
Stasium showing **External Managed Processes** and forwarding requested lifecycle actions to their **External Runtime**.
_Avoid_: Docker Visibility, Pod Visibility, Integration, External services

**External Runtime**:
A tool outside Stasium that owns the lifecycle of **External Managed Processes** for a **Project**.
_Avoid_: Integration, Platform, Provider

**External Runtime Session**:
Stasium's active-Workspace record that it requested lifecycle actions for an **External Managed Process** through an **External Runtime**.
_Avoid_: Process Ownership, Process Claim, Temporary ownership

**Manifest Editing**:
Changing a **Project**'s **Manifest** from the **Workspace**.
_Avoid_: Add/edit/delete, Config editing, Service management

**Project Setup**:
Creating a **Manifest** for a **Project** that does not have one.
_Avoid_: Init, Initialization, Bootstrap

**External Runtime Detection**:
Inspecting a **Project** for **External Runtimes** that Stasium can show through **External Runtime Visibility**.
_Avoid_: Compose detection, Docker discovery, Scanning

**Candidate Dependency**:
A provisional relationship between **Candidates** that can become a **Startup Dependency** after **Candidate Selection**.
_Avoid_: dependsOnIds, Generated dependency, Dependency id

## Relationships

- A **Direct Managed Process** is a kind of **Managed Process**.
- An **External Managed Process** is a kind of **Managed Process**.
- A **Docker Managed Process** is a kind of **Managed Process**.
- A **Docker Managed Process** is a kind of **External Managed Process**.
- A **Process Definition** describes one **Direct Managed Process**.
- A **Process Definition** has one **Launch Instruction**.
- A **Managed Process** can have zero or more **Startup Dependencies**.
- A **Startup Dependency** implies reverse shutdown ordering.
- A **Manifest** contains zero or more **Process Definitions** for **Direct Managed Processes**.
- A **Manifest** can enable or disable **External Runtime Visibility** per **External Runtime**.
- **Discovery** proposes zero or more **Process Definitions**.
- A **Candidate** can become a **Process Definition** when accepted by the developer.
- **Candidate Selection** accepts zero or more **Candidates**.
- A **Managed Process** has one **Process State** at a time.
- A **Direct Managed Process** has Stasium lifecycle **Process State**.
- A **Direct Managed Process** can report **Process State** that explains it was not started because a **Startup Dependency** failed.
- An **External Managed Process** reports **Process State** from its external runtime.
- A **Process Definition** can include one **Restart Rule**.
- A **Restart Rule** applies after a **Direct Managed Process** exits.
- A **Managed Process** can produce **Process Output**.
- A **Process Claim** identifies one **Direct Managed Process**.
- A **Process Claim** can outlive the **Direct Managed Process** it identifies.
- **Process Identity** determines whether a **Process Claim** still matches a live process.
- A **Project** has zero or one **Manifest**.
- A **Workspace** presents the **Managed Processes** for one **Project**.
- A **Workspace** presents **Process Output**.
- **Startup** follows **Startup Dependencies**.
- **Shutdown** releases **Process Claims**.
- **Shutdown** follows the reverse of **Startup Dependencies**.
- A **Direct Managed Process** has Stasium **Process Ownership**.
- Only **Direct Managed Processes** have Stasium **Process Ownership**.
- An **External Managed Process** does not have Stasium **Process Ownership**.
- A **Docker Managed Process** is acted on through Docker Compose and never has Stasium **Process Ownership**.
- A **Development Stack** belongs to one **Project**.
- A **Development Stack** contains zero or more **Managed Processes**.
- A **Development Stack** can contain both **Direct Managed Processes** and **External Managed Processes**.
- **External Runtime Visibility** applies to **External Managed Processes**.
- An **External Runtime** can provide zero or more **External Managed Processes**.
- Docker Compose is an **External Runtime**.
- An **External Runtime Session** can track External Managed Processes that Stasium requested to start during the active **Workspace**.
- An **External Runtime Session** does not create Stasium **Process Ownership** or **Process Claims**.
- **Manifest Editing** changes **Process Definitions**.
- **Manifest Editing** applies accepted changes to the active **Workspace**.
- **Manifest Editing** includes in-**Workspace** **Candidate Selection** that changes the **Manifest**.
- **Project Setup** creates one **Manifest**.
- **Project Setup** can use **Discovery**.
- **Project Setup** can create an empty **Manifest**.
- **External Runtime Detection** enables **External Runtime Visibility**.
- A **Candidate Dependency** can become a **Startup Dependency** after **Candidate Selection**.

## Example dialogue

> **Dev:** "If **Discovery** finds my web server, does Stasium own the database from Docker Compose too?"
> **Domain expert:** "No. **Discovery** proposes **Process Definitions** for **Direct Managed Processes**. Docker Compose entries are **External Managed Processes** shown through **External Runtime Visibility**; Stasium can forward actions to Docker Compose but does not have **Process Ownership** over them."

## Flagged ambiguities

- "service" appears in code and manifest shape, but the domain term is **Managed Process**. Use **Direct Managed Process** for manifest-defined processes and **Docker Managed Process** for Docker Compose entries.
- "managed" means a process appears in Stasium's management experience; it does not imply Stasium **Process Ownership**. Only **Direct Managed Processes** have Stasium **Process Ownership**.
- **Discovery** and **External Runtime Detection** are distinct. **Discovery** proposes **Process Definitions**; **External Runtime Detection** enables **External Runtime Visibility**.
- "logs" is UI/code shorthand; the domain term is **Process Output** because Stasium records or streams stdout and stderr rather than owning application log semantics.
- "selection" is overloaded in code. Use **Candidate Selection** only for accepting **Candidates** into the **Manifest**; active row selection in the **Workspace** is UI behavior.
