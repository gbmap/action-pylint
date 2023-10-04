const core = require('@actions/core');
const exec = require('@actions/exec');
const github = require('@actions/github');
let fail = true;
let pr_message = true;
let GITHUB_TOKEN = '';
let output = '';
let pylint_options = '';
const default_no_error_message = 'No lint errors found';

function commentPr(message, token) {
    const context = github.context;
    const client = github.getOctokit(token);
    client.rest.issues.createComment({
        ...context.repo,
        issue_number: context.payload.pull_request.number,
        body: message
    });
}

function parseLintMessage(lint_message) {
    return `${lint_message.type} [${lint_message['message-id']}] ${lint_message.message} (${lint_message.path}:${lint_message.line}:${lint_message.column})`;
}

function buildMessage(msgs, type) {
    if (msgs.length == 0) {
        return '';
    }

    let message = `===> ${msgs.length} ${type}(s) found:\n`;
    msgs.forEach(msg => message += `- ${parseLintMessage(msg)}\n`);
    return message;
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
            stdout: (data) => {
                output += data.toString();
            },
            stderr: (data) => {
                output += data.toString();
            }
        }
        await exec.exec('/bin/bash', ['-c', `pylint ${path} -f json ${pylint_options}`], options);
    } catch (error) {
        // Parse pylint output
        const pylint_output = JSON.parse(output);

        message_types = ['error', 'warning', 'info', 'convention', 'refactor'];

        final_msg = '';
        for (msg_type in message_types) {
            msgs = pylint_output.filter(message => message.type == msg_type);
            msg = buildMessage(msgs, msg_type);
            final_msg += msg;
        }
        console.log(final_msg);

        // Comment on PR
        if ((pr_message) && (message !== default_no_error_message)) {
            commentPr(message, GITHUB_TOKEN);
        }

        // Fail if needed
        if ((fail) && (message !== default_no_error_message)) {
            core.setFailed(message);
        }
    }
}

run();