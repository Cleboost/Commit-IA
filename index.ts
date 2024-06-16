import {execSync} from 'child_process';
import axios from 'axios';
import ora, {Ora} from 'ora';
import preMessage from './premessage.json' assert { type: 'json' };
import fs from 'fs';

// @TODO: Add support for params and customizations
// const params = process.argv.slice(2);
const commitTypes = [
    "✨ feat: ",
    "🚑 fix: ",
    "📝 docs: ",
    "💄 style: ",
    "♻️ refactor: ",
    "✅ test: ",
    "🔧 chore: "
];

// If you have a better prompt, feel free to change it :)
const promptText = `Summarize this git diff into a useful, 10 words commit message. 
Patern is: <emoji> <type>: <message>
You can use the following types: ${JSON.stringify(commitTypes)} :`;

async function prompt(prompt: string): Promise<string> {
    return (await axios.post('http://127.0.0.1:11434/api/generate', {
        prompt: prompt,
        temperature: 0.5,
        max_tokens: 60,
        model: "mistral",
        stream: false
    }, {
        headers: {
            'Content-Type': 'application/json'
        }
    })).data.response;
}

function getDiff(filename: string): string {
    return execSync(`git diff ${filename}`).toString()
}

function postTraitement(text: string): string {
    let res = text
    res = res.replace(/^[^✨🚑📝💄♻️✅🔧]*/, ""); // remove everything before the emoji
    res = res.replace(/['"`]/g, "")
    res = res.split("\n")[0]

    return res
}

function listDiffFiles(): Array<string> {
    return execSync('git status --porcelain').toString().split('\n').map((line: string) => line.split(' ')[line.split(' ').length - 1]).filter(Boolean)
}

async function getCommitMessage(): Promise<{ msg: string, filename: string }[]> {
    const diffFiles: string[] = listDiffFiles();
    const results: { msg: string, filename: string }[] = [];
    const spinner: Ora = ora('Generating commit messages').start();

    for (let i = 0; i < diffFiles.length; i++) {
        const file: string = diffFiles[i];
        const preMsg = preMessage.find((e) => e.filename === file);
        if (preMsg) {
            results.push({ msg: preMsg.msg, filename: file });
            continue;
        }

        if (!fs.existsSync(file)) {
            results.push({ msg: "🔧 chore: delete file", filename: file });
            continue;
        }

        spinner.text = `Generating commit messages for ${file} (${i + 1}/${diffFiles.length})`;

        let diff: string;
        try {
            diff = getDiff(file);
        } catch (error) {
            console.error(`❌ Error getting diff for file ${file}. Try to commit manually.`);
            continue;
        }

        let response: string;
        let commitMessage: string = "";

        // Keep generating until we get a non-empty commit message
        while (!commitMessage.trim()) {
            try {
                response = await prompt(promptText + diff);
                commitMessage = postTraitement(response);
            } catch (e) {
                console.error(`❌ Error generating commit message for file ${file}. Try to commit manually.`);
                break;
            }
        }

        if (commitMessage.trim()) {
            results.push({ msg: commitMessage, filename: file });
        }
    }

    spinner.stop();
    return results;
}

execSync('git config core.autocrlf false')

getCommitMessage().then((res: Array<{ msg: string, filename: string }>) => {
    console.log("\n\n")
    if (res.length === 0) return console.log("No files to commit. Be sure to have some changes or add the files to the git index (git add <file>)")
    for (const {msg, filename} of res) {
        execSync(`git add ${filename}`)
        execSync(`git commit -m "${msg}" ${filename}`)
        console.log(`✅  ${filename}: ${msg}`)
    }
})