import got from "got";

export interface NpmPackageInfo {
    _id: string;
    _rev: string;
    bugs: {
        url: string;
    };
    description: string;
    "dist-tags": {
        latest: string;
        beta: string;
    };
    homepage: string;
    keywords: string[];
    license: string;
    name: string;
    repository: {
        type: string;
        url: string;
    };
    time: Record<string, string>;
    versions: Record<
        string,
        {
            _id: string;
            version: string;
            name: string;
            license: string;
            keywords: string[];
            homepage: string;
            description: string;
            dist: {
                fileCount: number;
                unpackedSize: number;
                tarball: string;
                shasum: string;
                integrity: string;
            };
        }
    >;
}

export interface NpmDownloadStats {
    downloads: number;
    start: string;
    end: string;
    package: string;
}

const maxRetries = 3;

export async function getNpmPackageInfo(
    packageName: string
): Promise<NpmPackageInfo | null> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await got(
                `https://registry.npmjs.org/${packageName}`
            );

            if (response.statusCode !== 200) {
                throw new Error(
                    `HTTP ${response.statusCode}: ${response.statusMessage}`
                );
            }

            const packageData = JSON.parse(response.body) as NpmPackageInfo;
            return packageData;
        } catch (error) {
            continue;
        }
    }
    return null;
}

export async function getNpmPackageDownloadStats(
    packageName: string,
    period: "last-day" | "last-week" | "last-month" | "last-year" = "last-month"
): Promise<NpmDownloadStats | null> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await got(
                `https://api.npmjs.org/downloads/point/${period}/${packageName}`
            );

            if (response.statusCode !== 200) {
                throw new Error(
                    `HTTP ${response.statusCode}: ${response.statusMessage}`
                );
            }

            const data = JSON.parse(response.body) as NpmDownloadStats;
            return data || null;
        } catch (error) {
            continue;
        }
    }
    return null;
}
