const {execSync} = require('child_process');
const axios = require('axios');

const params = process.argv.slice(2);
const commitTypes = [
    "✨ feat: ",
    "🚑 fix: ",
    "📝 docs: ",
    "💄 style: ",
    "♻️ refactor: ",
    "✅ test: ",
    "🔧 chore: "
];

const promptText = `Summarize this git diff into a useful, 10 words commit message. 
Patern is: <emoji> <type>: <message>
You can use the following types: ${JSON.stringify(commitTypes)} :`;

async function prompt(prompt) {
    const data = {
        prompt: prompt,
        model: "mistral",
        stream: false,
        max_tokens: 60,
    }
    const res = await axios.post('http://127.0.0.1:11434/api/generate', data, {
        headers: {
            'Content-Type': 'application/json'
        }
    })

    // console.log(res)

    return res.data.response
}

function getDiff(filename) {
    return execSync(`git diff ${filename}`).toString()
}

function postTraitement(text) {
    let res = text
    res = res.replace(/^[^✨🚑📝💄♻️✅🔧]*/, ""); // remove everything before the emoji
    res = res.replace(/['"`]/g, "")

    return res
}

function listDiffFiles() {
    return execSync('git status --porcelain').toString().split('\n').map(line => line.split(' ')[line.split(' ').length - 1]).filter(Boolean)
}

function makePrompt(diff) {
    return promptText + diff
}

async function getCommitMessage() {
    const diffFiles = listDiffFiles();

    const promises = diffFiles.map(async (file) => {
        const diff = getDiff(file);
        const promptMessage = makePrompt(diff);
        const response = await prompt(promptMessage);
        const commitMessage = postTraitement(response);

        return { msg: commitMessage, filename: file };
    });

    const res = await Promise.all(promises);
    console.log(res)
    return res;
}



getCommitMessage().then(res => {
    if (res.length === 0) return console.log("No files to commit. Be sure to have some changes or add the files to the git index (git add <file>)")
    for (const {msg, filename} of res) {
        execSync(`git add ${filename}`)
        execSync(`git commit -m "${msg}" ${filename}`)
        console.log(`Commit message for ${filename}: ${msg}`)
    }
})