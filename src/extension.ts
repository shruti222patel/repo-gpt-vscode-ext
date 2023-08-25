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
	let apiKey = vscode.workspace.getConfiguration('repogpt').get('openaiApiKey');
	if (!apiKey) {
		// Prompt the user to enter the API key if it's not set
		vscode.window.showInputBox({
			prompt: 'Please enter your OpenAI API Key:',
			placeHolder: 'API Key...'
		}).then(value => {
			if (value) {
                const cleanedValue = value.trim();
				// Save the provided API key to the configuration
				vscode.workspace.getConfiguration('repogpt').update('openaiApiKey', cleanedValue, vscode.ConfigurationTarget.Global);
                apiKey = cleanedValue;
			}
		});
	}

    const pythonInterpreter = setupPythonEnv(context);

	// Register FunctionRunCodeLensProvider for all languages
	const languages = ['typescript', 'php', 'python', 'sql'];

    for (const lang of languages) {
        context.subscriptions.push(vscode.languages.registerCodeLensProvider(
            { scheme: 'file', language: lang },
            new FunctionRunCodeLensProvider(lang, context)
        ));
    }

    // Create a map to store the state for each function
    const functionStates: { [key: string]: string } = {};


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
            { 
                enableScripts: true,   // Enables JavaScript in the webview
                retainContextWhenHidden: true  // Retains the webview context when hidden
            }
        );

        // After creating the webview panel, move it to the last editor group (usually the bottom panel)
        vscode.commands.executeCommand('workbench.action.moveEditorToLastGroup');


        // Create a unique key for the function. Here we're just using the function name,
        // but you may need to make this more unique if there are potential overlaps.
        const functionKey = functionName;
        // Get the saved state for the function if available
        let savedOutput = functionStates[functionKey] || '';

        // Initial HTML structure with a script to handle messages from the extension
        let initialHtml = `
        <html>
            <head>
                <style>
                    pre {
                        white-space: pre-wrap;
                    }
                </style>
            </head>
            <body>
                <pre id="output">${savedOutput}</pre>
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

        panel.webview.html = initialHtml;

        panel.onDidDispose(() => {
            functionStates[functionKey] = panel.webview.html; // save the state for the function when the webview is disposed
        });

        pythonProcess.stdout.on('data', (data) => {
            savedOutput += data.toString();
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

    constructor(private language: string, private context: vscode.ExtensionContext) {}
    
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];

        let apiKey = vscode.workspace.getConfiguration('repogpt').get('openaiApiKey');
        if (!apiKey) {
            vscode.window.showErrorMessage('Please set your OpenAI API Key in the settings');
        }
        
        const filepath = document.fileName;
        const pythonInterpreter = setupPythonEnv(this.context);

        const extensionDir = this.context.extensionPath;
        const pythonScriptPath = path.join(extensionDir, 'generate_codelens.py');

        // Install the wheel package into the virtual environment
        const codelensStr = execSync(`${pythonInterpreter} ${pythonScriptPath} ${apiKey} ${this.language} ${filepath}`).toString();

        type ParsedCodeLens = {
            name: string;
            code: string;
            start_line: number;
        };

        try {
            const codelensArr: ParsedCodeLens[] = JSON.parse(codelensStr);
            for (const code of codelensArr) {
                const line = document.lineAt(code.start_line);
                const command: vscode.Command = {
                    title: "Explain",
                    command: "repogpt.explain",
                    arguments: [code.code , code.name, this.language]
                };
                codeLenses.push(new vscode.CodeLens(line.range, command));
            }
        } catch (error) {
            console.error("Error parsing the string into JSON:", error);
        }
        return codeLenses;
    }
}

// This method is called when your extension is deactivated
export function deactivate() {}
