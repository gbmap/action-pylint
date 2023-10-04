const core = require('@actions/core');
const exec = require('@actions/exec');
const github = require('@actions/github');
let fail = true;
let pr_message = true;
let GITHUB_TOKEN = '';
let output = '';
let pylint_options = '';
const default_no_error_message = 'No lint errors found';

let message_types = ['error', 'warning', 'info', 'convention', 'refactor'];
let message_headers = {
    'error': 'Errors 🚫',
    'warning': 'Warnings ⚠️',
    'info': 'Information ⚠',
    'convention': 'Conventions 📖',
    'refactor': 'Refactors 🛠️'
};

function commentPr(message, token) {
    const context = github.context;
    const client = github.getOctokit(token);
    client.rest.issues.createComment({
        ...context.repo,
        issue_number: context.payload.pull_request.number,
        body: message
    });
}

function buildMessage(pylint_output) {
    let message = "# 🧶 Pylint Results\n";
    message_types.forEach(msg_type => {
        msgs = pylint_output.filter(message => message.type == msg_type);
        message += buildMessageTable(msgs, message_headers[msg_type]);
    });
    return message;
}

function buildMessageTable(msgs, header) {
    let msg = `## ${header} (${msgs.length})\n`;
    msg += '| Code | Description | File | Line | Column |\n';
    msg += '| ---- | ----------- | ---- | ---- | ------ |\n';
    msgs.forEach(m => {
        msg += `| ${m['message-id']} | ${m.message} | ${m.path} | ${m.line} | ${m.column} |\n`;
    })
    msg += '\n';
    return msg;
}

async function run() {
    try {
        // Get inputs
        const path = core.getInput('path');
        fail = core.getInput('fail');
        pr_message = core.getInput('pr-message');
        pylint_options = core.getInput('pylint-options');
        GITHUB_TOKEN = core.getInput('GITHUB_TOKEN');

        // Install pylint
        await exec.exec('pip', ['install', 'pylint']);

        // Run pylint
        let options = {};
        options.listeners = {
            stdout: (data) => { output += data.toString(); },
            stderr: (data) => { output += data.toString(); }
        }
        await exec.exec('/bin/bash', ['-c', `pylint ${path} -f json ${pylint_options}`], options);
    } catch (error) {
        // Parse pylint output
        message = buildMessage(JSON.parse(output));

        // Comment on PR
        if (pr_message && (message !== default_no_error_message)) {
            commentPr(message, GITHUB_TOKEN);
        }

        // Fail if needed
        if (fail && (message !== default_no_error_message)) {
            core.setFailed(message);
        }
    }
}

run();