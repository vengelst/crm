import { NextResponse } from "next/server";

const GITHUB_OWNER = "vengelst";
const GITHUB_REPO = "crm";
const GITHUB_BRANCH = "main";

type GithubCommitResponse = {
  sha: string;
};

export async function GET() {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits/${GITHUB_BRANCH}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "crm-web-version-check",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          version: "unbekannt",
          commit: null,
          source: "github",
          error: `HTTP ${response.status}`,
        },
        { status: 200 },
      );
    }

    const body = (await response.json()) as GithubCommitResponse;
    const commit = body.sha.slice(0, 7);
    const version = `${GITHUB_BRANCH}@${commit}`;

    return NextResponse.json({
      version,
      commit,
      source: "github",
      url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/commit/${body.sha}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        version: "unbekannt",
        commit: null,
        source: "github",
        error: error instanceof Error ? error.message : "unbekannter Fehler",
      },
      { status: 200 },
    );
  }
}
