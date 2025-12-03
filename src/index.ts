import { Octokit } from "octokit";
import { GitHubRepo } from "./util/repo.js";
import { parseSyml } from '@yarnpkg/parsers';
import { YarnLockParser } from "./util/parse.js";
import { getNpmPackageInfo, getNpmPackageDownloadStats } from "./util/npm.js";
import { scanPRRisks } from "./tool/prscan.js";
import { makeReportInMd, md2Img } from "./report/index.js";
import { writeFileSync } from "node:fs";


// https://github.com/DeBankDeFi/defi-insight-react/pull/2323

const pr = await scanPRRisks(
    "DeBankDeFi",
    "defi-insight-react",
    2323,
    "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")

const r = makeReportInMd(pr!);

const img = await md2Img(r.report);
if (img) {
    writeFileSync("report.png", img);
}

console.log(r.abstract, "\n", r.report);


// 取消注释来测试
// await testNpmDownloads();


// const repo = new GitHubRepo("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");

// const prinfo = await repo.getPRInfo("RabbyHub", "rabby-mobile", 1082);

// const prfiles = await repo.getPRChangedFiles("RabbyHub", "rabby-mobile", 1082, 100);
// // console.log(prfiles);

// for (let i = 0; i < prfiles.length; i++) {
//     const file = prfiles[i]!;

//     if (file.filename !== "yarn.lock") {
//         continue;
//     }

//     if (file.status !== "modified") {
//         continue;
//     }

//     const content = await repo.getTextFileContent(
//         "RabbyHub",
//         "rabby-mobile",
//         file.filename,
//         prinfo.head.sha
//     );

//     if (content === null) {
//         console.log("Failed to fetch file content");
//         continue;
//     }
    
//     const parser = new YarnLockParser(content);
//     const deps = parser.getDependencies();
//     console.log(YarnLockParser.deps2Set(deps));
//     debugger
// }