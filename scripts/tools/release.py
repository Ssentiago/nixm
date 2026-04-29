import json
import os
import re
import shutil
import subprocess
import sys
from contextlib import contextmanager
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Callable

import questionary
import semver
import tomlkit
from dotenv import load_dotenv
from github import Auth
from github import Github
from questionary import Choice

load_dotenv()


@lru_cache(maxsize=None)
def find_root() -> Path:
    current = Path(__file__).parent
    while current != current.parent:
        if (current / ".root").exists():
            return current
        current = current.parent
    sys.exit("Root not found")


ROOT = find_root()

BACKEND_CARGO_TOML = ROOT / "nixm-backend" / "Cargo.toml"
FRONTEND_PACKAGE_JSON = ROOT / "nixm-frontend" / "package.json"


@dataclass
class ReleaseTransaction:
    _compensations: list[tuple[str, Callable]] = field(default_factory=list)

    def register(self, description: str, compensation: Callable):
        self._compensations.append((description, compensation))

    def rollback(self):
        print("\n[!] Rolling back changes...")
        for description, fn in reversed(self._compensations):
            try:
                print(f"  <- {description}")
                fn()
            except Exception as e:
                print(f"     Failed to rollback '{description}': {e}")


@contextmanager
def release_transaction():
    tx = ReleaseTransaction()
    try:
        yield tx
    except Exception as e:
        print(f"\n[!] Error: {e}")
        tx.rollback()
        sys.exit(1)


def get_binary_name() -> str:
    with open(BACKEND_CARGO_TOML, "r") as f:
        cargo_toml = tomlkit.load(f)
    return cargo_toml["package"]["name"]


def get_version_changelog_section(version: str) -> str:
    changelog = ROOT / "CHANGELOG.md"
    if not changelog.exists():
        sys.exit(f"Changelog file not found: {changelog}")

    changelog_content = changelog.read_text(encoding="utf-8")
    pattern = rf"^# {re.escape(version)}(.*?)(?=^# |\Z)"
    match = re.search(pattern, changelog_content, re.DOTALL | re.MULTILINE)

    if match is None or not match.group(1).strip():
        sys.exit(
            f"Changelog section for {version} not found. Please update the changelog."
        )

    return match.group(1)


def step_update_versions(tx: ReleaseTransaction, new_version: str):
    if not BACKEND_CARGO_TOML.exists():
        raise FileNotFoundError(f"Cargo.toml not found: {BACKEND_CARGO_TOML}")
    if not FRONTEND_PACKAGE_JSON.exists():
        raise FileNotFoundError(f"package.json not found: {FRONTEND_PACKAGE_JSON}")

    original_cargo = BACKEND_CARGO_TOML.read_text(encoding="utf-8")
    original_pkg = FRONTEND_PACKAGE_JSON.read_text(encoding="utf-8")

    with open(BACKEND_CARGO_TOML, "r+") as f:
        toml = tomlkit.load(f)
        old_version = toml["package"]["version"]
        toml["package"]["version"] = new_version
        f.seek(0)
        f.truncate()
        tomlkit.dump(toml, f)

    tx.register(
        f"Restore Cargo.toml version to {old_version}",
        lambda: BACKEND_CARGO_TOML.write_text(original_cargo, encoding="utf-8"),
    )

    with open(FRONTEND_PACKAGE_JSON, "r+") as f:
        js = json.load(f)
        js["version"] = new_version
        f.seek(0)
        f.truncate()
        json.dump(js, f, indent=2)

    tx.register(
        f"Restore package.json version",
        lambda: FRONTEND_PACKAGE_JSON.write_text(original_pkg, encoding="utf-8"),
    )

    print(f"[+] Versions updated to {new_version}")


def step_git_commit_push(tx: ReleaseTransaction, new_version: str, branch: str):
    subprocess.run("git reset", shell=True, check=True)
    subprocess.run(
        f"git add {BACKEND_CARGO_TOML} {FRONTEND_PACKAGE_JSON}",
        shell=True, check=True,
    )
    subprocess.run(
        f'git commit -m "chore: update app version to {new_version}"',
        shell=True, check=True,
    )

    tx.register(
        "Revert version bump commit",
        lambda: (
            subprocess.run("git reset --hard HEAD~1", shell=True, check=True),
            subprocess.run(f"git push --force origin {branch}", shell=True, check=True),
        ), )

    subprocess.run(f"git push origin {branch}", shell=True, check=True)

    print(f"[+] Committed and pushed to {branch}")


def step_build_and_release(
        tx: ReleaseTransaction,
        previous_version: str,
        new_version: str,
        changelog: str,
):
    GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
    auth = Auth.Token(GITHUB_TOKEN)
    gh = Github(auth=auth)
    repo = gh.get_repo("Ssentiago/Nixm")

    binary_name = get_binary_name()
    frontend_folder = ROOT / "nixm-frontend"
    backend_folder = ROOT / "nixm-backend"
    backend_binary = (
            backend_folder / "target/x86_64-unknown-linux-gnu/release/" / binary_name
    )
    temp_folder = ROOT / "temp_release"
    temp_folder.mkdir(exist_ok=True)

    tx.register(
        "Remove temp_release folder",
        lambda: shutil.rmtree(temp_folder, ignore_errors=True),
    )

    print("[+] Building frontend...")
    os.chdir(frontend_folder)
    subprocess.run(["bun", "run", "build"], check=True)
    shutil.make_archive(str(temp_folder / "dist"), "zip", frontend_folder / "dist")

    print("[+] Building backend...")
    os.chdir(backend_folder)
    subprocess.run(
        "cross build --release --target x86_64-unknown-linux-gnu --no-default-features",
        check=True, shell=True,
    )
    shutil.copy(backend_binary, temp_folder / binary_name)

    print(f"[+] Creating git tag {new_version}...")
    subprocess.run(["git", "tag", new_version], check=True)
    subprocess.run(["git", "push", "origin", new_version], check=True)

    tx.register(
        f"Delete git tag {new_version} locally and remotely",
        lambda: (
            subprocess.run(["git", "tag", "-d", new_version]),
            subprocess.run(["git", "push", "origin", "--delete", new_version]),
        ),
    )

    print("[+] Creating GitHub release...")
    if previous_version:
        full_changelog_url = (
            f"https://github.com/Ssentiago/Nixm/compare/{previous_version}...{new_version}"
        )
        release_body = f"{changelog}\n\nFull changelog: {full_changelog_url}"
    else:
        release_body = changelog

    release = repo.create_git_release(
        tag=f"{new_version}",
        name=f"Release {new_version}",
        message=release_body,
        draft=False,
        prerelease=False,
    )

    tx.register(
        f"Delete GitHub release {new_version}",
        lambda: release.delete_release(),
    )

    release.upload_asset(str(temp_folder / "dist.zip"))
    release.upload_asset(str(temp_folder / binary_name))

    shutil.rmtree(temp_folder, ignore_errors=True)

    print(f"[+] Release {new_version} created successfully!")


def make_version_validator(
        previous_versions: list[str], current_version: str, is_first_enter: bool
) -> Callable[[str], bool]:
    def inner(version: str) -> bool | str:
        if not version.strip():
            return True
        if not semver.Version.is_valid(version):
            return "Invalid version format. It should be semantic versioning (e.g., 1.2.3)"
        if version in previous_versions:
            return "Version already exists. Please try again."
        if not is_first_enter and semver.Version.parse(version) < semver.Version.parse(
                current_version
        ):
            return f"Version must be greater than current version. Current: {current_version}."
        return True

    return inner


def input_new_version(previous_versions, current_version, is_first_enter):
    answer = questionary.text(
        "Enter new version number or press Enter to exit: ",
        validate=make_version_validator(previous_versions, current_version, is_first_enter),
    ).ask()
    if not answer.strip():
        print("See you later!")
        sys.exit(0)
    return answer


def version_menu(previous_versions: list[str], current_version: str) -> str:
    while True:
        parsed = semver.Version.parse(current_version)
        major, minor, patch = parsed.major, parsed.minor, parsed.patch

        answer = questionary.select(
            f"Update current version {current_version} or perform other actions: ",
            [
                Choice(f"Patch (bug fixes): {major}.{minor}.{patch + 1}", "1"),
                Choice(f"Minor (new functionality): {major}.{minor + 1}.0", "2"),
                Choice(f"Major (significant changes): {major + 1}.0.0", "3"),
                Choice("Manual update (enter version)", "4"),
                Choice("View previous versions", "5"),
                Choice("Exit", "6"),
            ],
        ).ask()

        if answer is None:  # user pressed Ctrl+C
            print("See you later!")
            sys.exit(0)

        match answer:
            case "1":
                return f"{major}.{minor}.{patch + 1}"
            case "2":
                return f"{major}.{minor + 1}.0"
            case "3":
                return f"{major + 1}.0.0"
            case "4":
                return input_new_version(previous_versions, current_version, False)
            case "5":
                print("Previous versions:")
                print("\n- ".join(previous_versions))
                questionary.text("Press Enter to continue...").ask()
            case "6":
                print("See you later!")
                sys.exit(0)


def get_version() -> tuple[str, str]:
    tag_exec = subprocess.run(["git", "tag"], capture_output=True)
    tag_exec.check_returncode()

    tag_output = tag_exec.stdout.decode("utf-8").strip()
    tags = tag_output.split("\n") if tag_output else []

    if not tags:
        version = input_new_version(tags, None, True)
        return version, ""

    version = version_menu(tags, tags[-1])
    return version, tags[-1]


def check_github_token(token: str):
    try:
        gh = Github(auth=Auth.Token(token))
        gh.get_user().login
    except Exception as e:
        sys.exit(f"GitHub token is invalid or expired: {e}")


def main():
    GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
    if not GITHUB_TOKEN:
        sys.exit("GITHUB_TOKEN is not set. Please set it in the .env file.")

    check_github_token(GITHUB_TOKEN)

    while True:
        release_version, previous_version = get_version()

        confirmation = questionary.select(
            f"You entered version {release_version}. Continue?",
            [Choice("Yes", "y"), Choice("No", "n"), Choice("Retry", "r")],
        ).ask()

        match confirmation:
            case "y":
                break
            case "n":
                print("See you later!")
                sys.exit(0)
            case "r":
                pass

    changelog = get_version_changelog_section(release_version)

    current_branch = (
        subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True
        ).stdout.decode("utf-8").strip()
    )

    if current_branch not in ["main", "master", "dev"]:
        sys.exit("Current branch must be 'main', 'master', or 'dev'")

    with release_transaction() as tx:
        step_update_versions(tx, release_version)
        step_git_commit_push(tx, release_version, current_branch)
        step_build_and_release(tx, previous_version, release_version, changelog)


if __name__ == "__main__":
    main()
