#!/usr/bin/env node

const {execSync} = require('child_process');
const axios = require('axios').default;
const fs = require('fs');

let inquirer = null;
let chalk = null;
let ora = null

const preMessage = require('./premessage.json');
const detect = require('./typeDetection.json');


// @TODO: Add support for params and customizations
// const params = process.argv.slice(2);
const commitTypes = {
    feat: "✨",      // Feature
    fix: "🚑",       // Bug fix
    docs: "📝",      // Documentation
    style: "💄",     // Style
    refactor: "♻️",  // Refactoring
    test: "✅",      // Tests
    chore: "🔧"      // Chores
};

// If you have a better prompt, feel free to change it :)
const promptText = `Summarize this git diff into a useful, 10 words commit message.
Pattern is: <emoji> <type>: <message>
Give in output only my pattern, not the whole diff.
You can use the following types: ${Object.keys(commitTypes).map(type => `${commitTypes[type]} ${type}`).join(', ')} :`;

async function init() {
    ora = (await import('ora')).default
    inquirer = (await import('inquirer')).default
    chalk = (await import('chalk')).default
    execSync('git config core.autocrlf false');
    main();
}

function main() {
    console.log("🚀 Welcome to the Git Commit Message Generator 🚀")
    console.log(chalk.yellow("⚠️ This script use your GPU to run IA\n"))
    getCommitMessage().then(async res => {
        if (res.length === 0) return console.log("No files to commit. Be sure to have some changes or add the files to the git index (git add <file>)");
        console.log("\n\n");
        for (const {msg, filename} of res) {
            console.log(`✅  ${filename}: ${msg}`);
        }
        console.log("\n");
        console.log(chalk.yellow("⚠️ The spaces are not correctly rendered in the terminal but don't panic, they are correct in the commits. TODO fix \n"))

        const satisfaction = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'satisfying',
                message: 'Are you satisfied with the commit messages?',
                default: true
            }
        ]);

        if (!satisfaction.satisfying) return console.log("Please commit manually or run the script again.") && process.exit(0);

        for (const {msg, filename} of res) {
            if (fs.existsSync(filename)) execSync(`git add ${filename}`);
            execSync(`git commit -m "${msg}"`);
        }

        const push = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'push',
                message: 'Do you want to push the changes?',
                default: false
            }
        ]);

        if (push.push) execSync('git push');
        console.log("\n\n✅  All done!");
    }).catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
    });
}

function listDiffFiles() {
    return execSync('git status --porcelain').toString().split('\n').map(line => line.split(' ')[line.split(' ').length - 1]).filter(Boolean);
}

function getDiff(filename) {
    return execSync(`git diff ${filename}`).toString();
}

async function promptUser(prompt) {
    const response = await axios.post('http://127.0.0.1:11434/api/generate', {
        prompt: prompt,
        model: "llama3:8b",
        stream: false,
        options: {
            num_keep: 5,
            // seed: 123,
            num_predict: 20,
            top_k: 30,
            top_p: 2,
            tfs_z: 0.5,
            typical_p: 0.7,
            repeat_last_n: 33,
            temperature: 0.4,
            repeat_penalty: 1.2,
            presence_penalty: 1.8,
            frequency_penalty: 1.2,
            mirostat: 1,
            mirostat_tau: 0.8,
            mirostat_eta: 0.6,
            penalize_newline: true
        }
    }, {
        headers: {
            'Content-Type': 'application/json'
        },
        timeout: 10000
    }).catch(error => {
        // console.log(error)
        console.log("timeout")
        if (error.code === 'ECONNABORTED') {
            return {data: {response: "timeout"}};
        }
    })
    // console.log(response.data.response)
    return response.data.response;
}

function postTraitement(text, commitType) {
    const emojiRegex = /\p{Extended_Pictographic}/gu;

    let res = text.trim();
    res = res.replace(/[^a-zA-Z\p{Extended_Pictographic}\s:]/gu, ""); // Remove special characters
    res = res.replace(/\n/g, " "); // Remove new lines

    res = res.split(": ").shift() + ": " + res.split(": ").slice(1).join(": ").replaceAll(emojiRegex, ""); // Remove emojis except the first one
    res = res.replace(/['"`]/g, ''); // Remove quotes

    if (!text.match(emojiRegex)) res = commitTypes[commitType] + " " + res; // Add emoji if not present

    const typePattern = new RegExp(`(${Object.keys(commitTypes).map(type => commitTypes[type].trim()).join('|')})`);
    res = res.replace(typePattern, match => ` ${match}`); // Add space after emoji

    const type = res.split(":")[0].trim().replace(emojiRegex, "").replace(":", "").replace(" ", "")
    if (type === "") {
        const emoji = res.match(emojiRegex)[0]
        if (emoji) {
            res = res.replace(emoji, `${commitTypes[type]} ${type} `)
        }
    }

    const emoji = res?.match(emojiRegex)[0]
    if (emoji) {
        if (emoji !== commitTypes[type]) {
            res = res.replace(emoji, `${commitTypes[type]}`)
        }
    }

    res = res.replace(/(\s{2,})/g, " "); // Remove multiple spaces

    return res;
}

async function getCommitMessage() {
    const diffFiles = listDiffFiles();
    const results = [];
    let counterTotal = 0;
    let counterFile = 0;


    for (let i = 0; i < diffFiles.length; i++) {
        counterFile = 0;
        const spinner = ora(`Generating commit messages for ${diffFiles[i]} ${chalk.magenta(`(${i + 1}/${diffFiles.length})`)}`).start();
        const interval = setInterval(() => {
            counterTotal++;
            counterFile++;
            spinner.suffixText = `(file: ${formatTime(counterFile)}, total: ${formatTime(counterTotal)})`;
        }, 1000);


        const file = diffFiles[i];
        const preMsg = preMessage.find(e => e.filename === file);
        if (preMsg) {
            results.push({msg: preMsg.msg, filename: file});
            spinner.succeed(`Commit message generated for ${file} (${i + 1}/${diffFiles.length})`);
            clearInterval(interval);
            continue;
        }

        if (!fs.existsSync(file)) {
            results.push({msg: "🔧 chore: delete file", filename: file});
            spinner.succeed(`File ${file} was deleted. Commit message generated.`);
            clearInterval(interval);
            continue;
        }


        let diff;
        try {
            diff = getDiff(file);
        } catch (error) {
            spinner.fail(`Error getting diff for file ${file}. Try to commit manually.`);
            continue;
        }

        let response;
        let commitMessage = "";

        // Keep generating until we get a non-empty commit message
        while (!commitMessage.trim()) {
            try {
                response = await promptUser(promptText + diff);
                if (response === "timeout") {
                    commitMessage = response;
                    break;
                }
                commitMessage = postTraitement(response, detectCommitType(response));
            } catch (e) {
                console.error(e);
                spinner.fail(`Error generating commit message for file ${file}. Try to commit manually.`);
                break;
            }
        }

        if (commitMessage === "timeout") {
            spinner.fail(`Timeout generating commit. Try to commit manually.`);
            continue;
        }

        if (commitMessage.trim()) {
            results.push({msg: commitMessage, filename: file});
            spinner.succeed(`Commit message generated for ${file} ${chalk.magenta(`(${i + 1}/${diffFiles.length})`)}`);
        }

        clearInterval(interval);
    }

    return results;
}

function detectCommitType(message) {
    const words = message.split(" ");
    for (const type of detect) {
        for (const key in type) {
            for (const word of type[key]) {
                if (words.includes(word)) {
                    return key;
                }
            }
        }
    }
    return "chore";
}

function formatTime(seconds) {
    if (seconds < 60) {
        return `${seconds}sec`;
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}min ${remainingSeconds}sec`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const remainingMinutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        return `${hours}h ${remainingMinutes}min ${remainingSeconds}sec`;
    }
}

init();