// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
const fs = require('fs');
const { execSync } = require('child_process');
const os = require('os');
const path = require('path');

import { spawn } from 'child_process';

function setupPythonEnv(context: vscode.ExtensionContext) {
    const extensionDir = context.extensionPath;
    const venvDir = path.join(extensionDir, 'venv');
    const wheelPath = path.join(extensionDir, 'repo_gpt-0.1.5-py3-none-any.whl');
    const lastWheelPath = path.join(extensionDir, 'last_wheel.txt');

    // If last_wheel.txt doesn't exist or contains a different wheel filename, recreate venv
    if (!fs.existsSync(venvDir) || !fs.existsSync(lastWheelPath) || fs.readFileSync(lastWheelPath, 'utf8') !== path.basename(wheelPath)) {
        // Remove existing venv directory if it exists
        if (fs.existsSync(venvDir)) {
            fs.rmdirSync(venvDir, { recursive: true });
        }

        // Create a new virtual environment
        execSync(`python3 -m venv ${venvDir}`);

        // Install the wheel package into the virtual environment
        execSync(`${path.join(venvDir, 'bin', 'pip')} install ${wheelPath}`);

        // Store the current wheel filename
        fs.writeFileSync(lastWheelPath, path.basename(wheelPath));
    }

    return path.join(venvDir, 'bin', 'python');
}


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "repo-gpt" is now active!');

	// Check if API key is set
	let apiKey = vscode.workspace.getConfiguration('repogpt').get<string>('openaiApiKey');
	if (!apiKey) {
		// Prompt the user to enter the API key if it's not set
		vscode.window.showInputBox({
			prompt: 'Please enter your OpenAI API Key:',
			placeHolder: 'API Key...'
		}).then(value => {
			if (value) {
				// Save the provided API key to the configuration
				vscode.workspace.getConfiguration().update('openai.apiKey', value, vscode.ConfigurationTarget.Global);
                apiKey = value;
			}
		});
	}

    const pythonInterpreter = setupPythonEnv(context);

	// Register FunctionRunCodeLensProvider for all languages
	const languages = ['typescript', 'php', 'python'];

    for (const lang of languages) {
        context.subscriptions.push(vscode.languages.registerCodeLensProvider(
            { scheme: 'file', language: lang },
            new FunctionRunCodeLensProvider(lang)
        ));
    }

    context.subscriptions.push(vscode.commands.registerCommand('repogpt.explain', (functionBody:string, functionName: string, language: string) => {
        // Write the function content to a temp file
        const tempFilePath = path.join(os.tmpdir(), 'function_content.txt');
        fs.writeFileSync(tempFilePath, functionBody); // or whatever content you need

        const extensionDir = context.extensionPath;
        const pythonScriptPath = path.join(extensionDir, 'test_python_script.py');

        // Construct the command
        const pythonProcess = spawn(pythonInterpreter, [pythonScriptPath, apiKey, language, tempFilePath]);
        // Create a webview panel to stream Python script output
        const panel = vscode.window.createWebviewPanel(
            'pythonScriptOutput',      // Identifies the type of the webview
            `Explain - ${functionName}`,   // Title of the panel displayed to the user
            vscode.ViewColumn.Beside,    // Determines the column to show the new webview
            { enableScripts: true }   // Enables JavaScript in the webview
        );

        // After creating the webview panel, move it to the last editor group (usually the bottom panel)
        vscode.commands.executeCommand('workbench.action.moveEditorToLastGroup');


        // Initial HTML structure with a script to handle messages from the extension
        panel.webview.html = `
        <html>
            <head>
                <style>
                    pre {
                        white-space: pre-wrap;  /* Allow text to wrap */
                    }
                </style>
            </head>
            <body>
                <pre id="output"></pre>
                <script>
                    const outputPre = document.getElementById('output');
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'append':
                                if (message.isError) {
                                    outputPre.style.color = 'red';
                                }
                                outputPre.textContent += message.data;
                                break;
                        }
                    });
                </script>
            </body>
        </html>
        `;

        pythonProcess.stdout.on('data', (data) => {
            panel.webview.postMessage({ type: 'append', data: data.toString(), isError: false });
        });

        pythonProcess.stderr.on('data', (data) => {
            panel.webview.postMessage({ type: 'append', data: data.toString(), isError: true });
        });

        pythonProcess.on('close', (code) => {
            panel.webview.postMessage({ type: 'append', data: `Python script exited with code ${code}`, isError: false });
        });
    }));
}

class FunctionRunCodeLensProvider implements vscode.CodeLensProvider {
    private regex: RegExp | null;
    private bodyRegex: RegExp | null;

    constructor(private language: string) {
        this.language = language;
        switch (language) {
            case 'typescript':
                this.regex = /function (\w+)\(/g;
                this.bodyRegex = /function \w+\s?\([^)]*\)\s?\{([\s\S]*?)\}/g;
                break;
            case 'php':
                this.regex = /function (\w+)\(/g;
                this.bodyRegex = /function \w+\s?\([^)]*\)\s?\{([\s\S]*?)\}/g;
                break;
            case 'python':
                this.regex = /def (\w+)\(/g;
                this.bodyRegex = /def \w+\s?\([^)]*\):\s*^(\s*)([\s\S]*?)(?=^\1(?!\s)|^\s*$)/gm;
                break;
            default:
                this.regex = null;
                this.bodyRegex = null;
        }
    }
    
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        let matches, bodyMatches;
        const codeLenses: vscode.CodeLens[] = [];

		if (this.regex === null || this.bodyRegex === null) {
			return codeLenses;
		}

        while (matches = this.regex.exec(document.getText())) {
            const functionName = matches[1];
            const line = document.lineAt(document.positionAt(matches.index).line);

            // Extract function body
            let functionBody = '';
            while (bodyMatches = this.bodyRegex.exec(document.getText())) {
                if (bodyMatches[1]) {  // Body is usually in the first capture group
                    functionBody = bodyMatches[1];
                    break;  // Exit once the body is found
                }
            }
            const command: vscode.Command = {
                title: "Explain",
                command: "repogpt.explain",
                arguments: [functionBody , functionName, this.language]
            };
            codeLenses.push(new vscode.CodeLens(line.range, command));
        }

        return codeLenses;
    }
}


// This method is called when your extension is deactivated
export function deactivate() {}
