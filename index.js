const core = require('@actions/core');
const exec = require('@actions/exec');
const github = require('@actions/github');

let pr_message = core.getInput('pr-message');
let pr_number = core.getInput('pull-request-number');
let force_pr_message = core.getInput('force-pr-message');
let GITHUB_TOKEN = core.getInput('GITHUB_TOKEN');
let pylint_options = core.getInput('pylint-options');
let min_score = core.getInput('min-score');

let message_types = ['error', 'warning', 'info', 'convention', 'refactor'];

let report_header = "# 🧶 Pylint Results\n";

async function searchExistingPRComment(context, octokit) {
    // searches the PR for an existing comment from this action
    let comments = await octokit.rest.issues.listComments({
        ...context.repo,
        issue_number: context.issue.number
    });

    const exist = comments.data.find(comment => {
        return comment.body?.startsWith(report_header)
    })
    if (exist) {
        return exist;
    }
    return null
}

async function commentPr(message, token) {
    const context = github.context;
    const octokit = github.getOctokit(token);

    let comment = await searchExistingPRComment(context, octokit);
    if (comment) {
        await octokit.rest.issues.updateComment({
            ...context.repo,
            issue_number: context.issue.number,
            comment_id: comment.id,
            body: message
        });
    }
    else {
        await octokit.rest.issues.createComment({
            ...context.repo,
            issue_number: context.issue.number,
            body: message
        });
    }
}

function buildMessage(pylint_output, min_score) {
    let message = report_header;

    pylint_report = pylint_output["statistics"];

    message += "## 🎯 Score\n"

    score_icon = "✅";
    if (pylint_report["score"] < min_score) {
        score_icon = "❌";
    }
    message += `${score_icon} Score: ${pylint_report["score"]}/10\n\n`;
    message += '## ✉️ Messages \n'
    pylint_messages = pylint_output["messages"];
    message_types.forEach(msg_type => {
        msgs = pylint_messages.filter(message => message.type == msg_type);
        message += buildMessageTable(msgs, core.getInput(`${msg_type}-header`), true); // core.getInput(`${msg_type}-collapse`));
        // collapse is not working
    });

    message += "\n> __Commit:__ _" + github.context.sha + "_\n";
    return message;
}

function buildMessageTable(msgs, header, collapse) {
    if (msgs.length == 0) {
        return "";
    }

    let msg = `### ${header} (${msgs.length})\n`;
    if (collapse) {
        msg = `<details><summary><h3>${header} (${msgs.length})</h3></summary><p>\n\n`;
    }
    msg += '| Code | Description | File | Line | Column |\n';
    msg += '| ---- | ----------- | ---- | ---- | ------ |\n';
    msgs.forEach(m => {
        msg += `| ${m.messageId} | ${m.message} | ${m.path} | ${m.line} | ${m.column} |\n`;
    })
    msg += '\n';

    if (collapse) {
        msg += '</p></details>\n\n';
    }
    return msg;
}

function loadConfigs(message_types) {
    let configs = {};
    message_types.forEach(msg_type => {
        configs[msg_type] = core.getInput(msg_type);
    });
    return configs;
}

function failed(pylint_output) {
    let score = pylint_output["statistics"]["score"];

    if (score < min_score) {
        core.setFailed(`Pylint score of ${score} is less than minimum score of ${min_score}`);
        return true;
    }

    for (msg_type in message_types) {
        let max_count = core.getInput(`${msg_type}-max-count`);
        if (pylint_output["statistics"]["messageTypeCount"][msg_type] > max_count && max_count != -1) {
            core.setFailed(`Pylint ${msg_type} count of ${pylint_output["statistics"]["messageTypeCount"][msg_type]} is more than the allowd maximum of ${min_count}`);
            return true;
        }
    }
}

async function run() {
    let output = '';
    try {
        configs = loadConfigs(message_types);

        // Get inputs
        const path = core.getInput('path');

        // Install pylint
        await exec.exec('pip', ['install', 'pylint']);

        // Run pylint
        let options = {};
        options.listeners = {
            stdout: (data) => { output += data.toString(); },
            stderr: (data) => { output += data.toString(); }
        }
        await exec.exec('/bin/bash', ['-c', `pylint ${path} -f json2 ${pylint_options}`], options);
    } catch (error) {
        // Parse pylint output
        pylint_output = JSON.parse(output);
        if ((failed(pylint_output) && pr_message) || force_pr_message) {
            commentPr(buildMessage(pylint_output, min_score), GITHUB_TOKEN);
        }
    }
}

run();