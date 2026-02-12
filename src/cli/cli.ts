#!/usr/bin/env node
import { program } from "commander";
import { execSync } from "child_process";
import { scanByFileDiff, scanPRRisks } from "../tool/prscan.js";
import { writeFileSync } from "fs";
import { makeReportInMd } from "../report/index.js";
import { Octokit } from "octokit";

program
    .command("branch")
    .description("根据分支文件变更分析NPM依赖变更")
    .argument("<base>", "基础分支")
    .argument("<head>", "变更分支")
    .option("-r, --repo <repo>", "仓库路径", ".")
    .option("-o, --output <output>", "输出文件路径，若不指定则输出到控制台", "")
    .action(async (base: string, head: string, options: { repo: string, output: string }) => {
        console.log(`分析 ${options.repo} 仓库从 ${base} 到 ${head} 的变更`);
        const output = execSync(`git diff --name-only ${base} ${head}`, { cwd: options.repo }).toString();
        const files = [];
        for (let line of output.split("\n")) {
            line = line.trim();
            if (line.endsWith("yarn.lock")) {
                console.log(`  发现变更: ${line}`);
            } else if (line.endsWith("pnpm-lock.yaml")) {
                console.log(`  发现变更: ${line}`);
            } else if (line.endsWith("package-lock.json")) {
                console.error(`  发现变更: ${line} (暂不支持分析package-lock.json)`);
                continue;
            } else {
                continue;
            }

            const file1 = execSync(`git show ${base}:${line}`, { cwd: options.repo }).toString();
            const file2 = execSync(`git show ${head}:${line}`, { cwd: options.repo }).toString();
            files.push({
                filename: line,
                oldContent: file1,
                newContent: file2,
            });
        }

        const sr = await scanByFileDiff(files);
        
        const report = makeReportInMd(sr);
        if (options.output.length > 0) {
            
            writeFileSync(options.output, report.report, { encoding: "utf-8" });
            console.log(`分析报告已写入 ${options.output}`);
        } else {
            console.log(report.report);
        }
    });

program.command("github").description("根据GitHub Pull Request分析NPM依赖变更")
    .argument("<link>", "Pull Request链接")
    .option("-t, --token <token>", "GitHub访问令牌", "")
    .option("-o, --output <output>", "输出文件路径，若不指定则输出到控制台", "")
    .option("--reply", "回复分析结果到Pull Request中", false)
    .action(async (link: string, options: { token: string, output: string, reply: boolean }) => {
        console.log(`分析 Pull Request: ${link}`);

        const match = link.match(
                /https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/
            );
            if (match) {
                const owner = match[1];
                const repo = match[2];
                const prNumber = match[3];

                const sr = await scanPRRisks(owner!, repo!, parseInt(prNumber!), options.token);
                const report = makeReportInMd(sr!);
                if (options.output.length > 0) {
                    writeFileSync(options.output, report.report, { encoding: "utf-8" });
                    console.log(`分析报告已写入 ${options.output}`);
                } else {
                    console.log(report.report);
                }
                if (options.reply) {
                    console.log("正在回复分析结果到Pull Request...");
                    
                    const octokit = new Octokit({ auth: options.token.length > 0 ? options.token : undefined });
                    await octokit.rest.issues.createComment({
                        owner: owner!,
                        repo: repo!,
                        issue_number: parseInt(prNumber!),
                        body: report.report,
                    });
                    console.log("回复完成");
                }

            } else {
                console.error("无法解析Pull Request链接");
                return;
            }
    });

program.parse();