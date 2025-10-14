import { Octokit } from "octokit";
import got from "got";

export class GitHubRepo {
    private octokit: Octokit;
    private maxRetries: number;

    constructor(authToken?: string, maxRetries = 3) {
        this.maxRetries = maxRetries;
        this.octokit = new Octokit(authToken ? { auth: authToken } : {});
    }

    public async getPRInfo(owner: string, repo: string, pull_number: number) {
        for (let i = 0; i < this.maxRetries; i++) {
            try {
                console.info(
                    `Fetching PR info ${owner}/${repo}#${pull_number}`
                );
                const { data } = await this.octokit.rest.pulls.get({
                    owner,
                    repo,
                    pull_number,
                });
                return data;
            } catch (error) {}
        }

        throw new Error("读取PR信息失败");
    }

    public async getPRChangedFiles(
        owner: string,
        repo: string,
        pull_number: number,
        per_page = 30
    ) {
        const files = [];

        let page = 1;
        while (true) {
            let data;
            for (let i = 0; i < this.maxRetries; i++) {
                try {
                    console.info(
                        `Fetching PR files ${owner}/${repo}#${pull_number} page ${page}`
                    );
                    data = await this.octokit.rest.pulls.listFiles({
                        owner,
                        repo,
                        pull_number,
                        per_page,
                        page,
                    });
                    break; // 成功获取数据，跳出重试循环
                } catch (error) {}
            }
            if (data) {
                files.push(...data.data);
                page++;
                if (data.data.length < per_page) {
                    break;
                }
            } else {
                throw new Error("读取PR变更文件失败");
            }
        }

        return files;
    }

    public async getTextFileContent(
        owner: string,
        repo: string,
        path: string,
        ref: string
    ): Promise<string | null> {
        // 使用多种方式获取文件内容，解决原API经常超时的问题

        try {
            console.info(
                `Fetching ${owner}/${repo}/${path}@${ref} via Git Data API`
            );

            // 先获取commit的tree
            const { data: commit } = await this.octokit.rest.git.getCommit({
                owner,
                repo,
                commit_sha: ref,
            });

            // 递归查找文件
            const blob = await this.findFileInTree(
                owner,
                repo,
                commit.tree.sha,
                path
            );
            if (blob) {
                const { data: blobData } = await this.octokit.rest.git.getBlob({
                    owner,
                    repo,
                    file_sha: blob.sha!,
                });

                if (blobData.encoding === "base64") {
                    return Buffer.from(blobData.content, "base64").toString(
                        "utf-8"
                    );
                }
            }
        } catch (error) {
            console.warn(`Git Data API failed for ${path}:`, error);
        }

        for (let i = 0; i < this.maxRetries; i++) {
            try {
                console.info(
                    `Fetching ${owner}/${repo}/${path}@${ref} via Contents API (attempt ${
                        i + 1
                    })`
                );
                const { data } = await this.octokit.rest.repos.getContent({
                    owner,
                    repo,
                    path,
                    ref,
                });

                if ("content" in data && data.content) {
                    // 使用 Buffer 解码 base64 内容 (替代 atob，更可靠)
                    return Buffer.from(data.content, "base64").toString(
                        "utf-8"
                    );
                } else if ("download_url" in data && data.download_url) {
                    // 文件过大时：使用 download_url 获取原始内容
                    const response = await got(data.download_url);
                    if (response.statusCode === 200) {
                        return response.body;
                    }
                }
            } catch (error) {
                console.warn(
                    `Contents API attempt ${i + 1} failed for ${path}:`,
                    error
                );
                if (i === this.maxRetries - 1) {
                    // 最后一次重试失败，尝试其他方法
                    break;
                }
                // 等待一段时间再重试
                await new Promise((resolve) =>
                    setTimeout(resolve, 200 * (i + 1))
                );
            }
        }

        try {
            console.info(
                `Fetching ${owner}/${repo}/${path}@${ref} via raw URL`
            );
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
            const response = await got(rawUrl);
            if (response.statusCode === 200) {
                return response.body;
            }
        } catch (error) {
            console.warn(`Raw URL failed for ${path}:`, error);
        }

        console.error(
            `All methods failed to fetch ${owner}/${repo}/${path}@${ref}`
        );
        return null;
    }

    /**
     * 在Git树中递归查找文件
     */
    private async findFileInTree(
        owner: string,
        repo: string,
        treeSha: string,
        filePath: string
    ): Promise<{ sha: string } | null> {
        const pathParts = filePath.split("/");
        let currentTreeSha = treeSha;
        let currentPath = "";

        for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i]!;
            currentPath = currentPath ? `${currentPath}/${part}` : part;

            try {
                const { data: tree } = await this.octokit.rest.git.getTree({
                    owner,
                    repo,
                    tree_sha: currentTreeSha,
                });

                const item = tree.tree.find((item) => item.path === part);
                if (!item) {
                    return null;
                }

                if (i === pathParts.length - 1) {
                    // 这是最后一个部分，应该是文件
                    return item.type === "blob" ? { sha: item.sha! } : null;
                } else {
                    // 这是一个目录，继续递归
                    if (item.type === "tree") {
                        currentTreeSha = item.sha!;
                    } else {
                        return null;
                    }
                }
            } catch (error) {
                console.warn(`Failed to get tree ${currentTreeSha}:`, error);
                return null;
            }
        }

        return null;
    }
}
