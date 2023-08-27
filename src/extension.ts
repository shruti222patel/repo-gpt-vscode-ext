import * as vscode from 'vscode';
const fs = require('fs');
const { execSync } = require('child_process');
const os = require('os');
const path = require('path');

import { spawn } from 'child_process';
import { create } from 'domain';


import ChatGptViewProvider from './chatgpt-view-provider';


function setupPythonEnv(context: vscode.ExtensionContext) {
    const extensionDir = context.extensionPath;
    const venvDir = path.join(extensionDir, 'venv');
    const wheelPath = path.join(extensionDir, 'repo_gpt-0.1.6-py3-none-any.whl');
    const lastWheelPath = path.join(extensionDir, 'last_wheel.txt');
    const pythonInterpreter = path.join(venvDir, 'bin', 'python');

    // If last_wheel.txt doesn't exist or contains a different wheel filename, recreate venv
    if (!pythonInterpreter || !fs.existsSync(lastWheelPath) || fs.readFileSync(lastWheelPath, 'utf8') !== path.basename(wheelPath)) {
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

    return pythonInterpreter;
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


    // REGISTER SUBSCRIOTIONS
    // Register ChatGptViewProvider for all languages
    const chatViewProvider = new ChatGptViewProvider(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("repogpt.view", chatViewProvider, {
        webviewOptions: { retainContextWhenHidden: true }
    }));
    console.log("registered webview view provider");

	// Register FunctionRunCodeLensProvider for all languages
	const languages = ['typescript', 'php', 'python', 'sql'];
    for (const lang of languages) {
        context.subscriptions.push(vscode.languages.registerCodeLensProvider(
            { scheme: 'file', language: lang },
            new FunctionRunCodeLensProvider(lang, context)
        ));
    }

    context.subscriptions.push(vscode.commands.registerCommand('repogpt.createTest', async (functionBody: string, originalFilePath: string, language: string) => {
    
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Generating tests...",
            cancellable: false // Change this to true if you want to handle cancellation
        }, async (progress) => {
            // Write the function content to a temp file
            const tempFilePath = path.join(os.tmpdir(), 'function_content.txt');
            fs.writeFileSync(tempFilePath, functionBody); // or whatever content you need
        
            const extensionDir = context.extensionPath;
            const pythonScriptPath = path.join(extensionDir, 'python_scripts', 'create_tests.py');
            const testFramework = "";
    
            // Set the output file to be in the same directory as the original file
            const outputFileName = 'demo_generated_tests.py';
            const outputFilePath = path.join(path.dirname(originalFilePath), outputFileName);
    
            // Construct the command
            const pythonProcess = spawn(pythonInterpreter, [pythonScriptPath, apiKey, language, testFramework, tempFilePath, outputFilePath]);
        
            // If you want to report progress from the pythonProcess (optional), 
            // you could listen to its stdout/stderr and call progress.report as needed.
        
            // Example:
            pythonProcess.stdout.on('data', (data) => {
                // Parse data for progress updates and report them
                // progress.report({ increment: 10, message: `Processed ${data}` });
            });
                
            // Handle process completion
            return new Promise((resolve, reject) => {
                pythonProcess.on('close', resolve);
                pythonProcess.on('error', reject);
            });
        });
    
        vscode.window.showInformationMessage('Finished generating tests!');
    }));
    

    context.subscriptions.push(vscode.commands.registerCommand('repogpt.explain', (functionBody:string, functionName: string, language: string) => {
        // Write the function content to a temp file
        const tempFilePath = path.join(os.tmpdir(), 'function_content.txt');
        fs.writeFileSync(tempFilePath, functionBody); // or whatever content you need

        const extensionDir = context.extensionPath;
        const pythonScriptPath = path.join(extensionDir, 'python_scripts', 'explain_code.py');

        // Construct the command
        const pythonProcess = spawn(pythonInterpreter, [pythonScriptPath, apiKey, language, tempFilePath]);

        // Create new response html
        chatViewProvider.sendMessageToWebView({ type: 'addResponse', value: `Explaination of: ${functionName}` });

        pythonProcess.stdout.on('data', (data) => {
            chatViewProvider.sendMessageToWebView({ type: 'append', value: data.toString(), isError: false });
        });

        pythonProcess.stderr.on('data', (data) => {
            // console.error(data.toString());
            chatViewProvider.sendMessageToWebView({ type: 'append', value: data.toString(), isError: true });
        });

        // pythonProcess.on('close', (code) => {
        //     chatViewProvider.sendMessageToWebView({ type: 'append', value: `Python script exited with code ${code}`, isError: false });
        // });
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
        const pythonScriptPath = path.join(extensionDir, 'python_scripts', 'generate_codelens.py');

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
                const explainCommand: vscode.Command = {
                    title: "Explain",
                    command: "repogpt.explain",
                    arguments: [code.code , code.name, this.language]
                };
                codeLenses.push(new vscode.CodeLens(line.range, explainCommand));

                if (this.language !== 'sql') {
                    const createTestCommand: vscode.Command = {
                        title: "Create Test",
                        command: "repogpt.createTest",
                        arguments: [code.code , filepath, this.language]
                    };
                    codeLenses.push(new vscode.CodeLens(line.range, createTestCommand));
                }
            }
        } catch (error) {
            console.error("Error parsing the string into JSON:", error);
        }
        return codeLenses;
    }
}

// This method is called when your extension is deactivated
export function deactivate() {
    try {
        const extensionDir = vscode.extensions.getExtension('shruti222patel.repo-gpt')?.extensionPath;
        if (extensionDir) {
            const venvDir = path.join(extensionDir, 'venv');
            const lastWheelPath = path.join(extensionDir, 'last_wheel.txt');

            // Remove venv directory if it exists
            if (fs.existsSync(venvDir)) {
                fs.rmdirSync(venvDir, { recursive: true });
            }

            // Remove last_wheel.txt if it exists
            if (fs.existsSync(lastWheelPath)) {
                fs.unlinkSync(lastWheelPath);
            }
        }
    } catch (error) {
        console.error("Error during deactivation:", error);
    }
}
