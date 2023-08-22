// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

function setupPythonEnv(context: vscode.ExtensionContext) {
    const extensionDir = context.extensionPath;
    const venvDir = path.join(extensionDir, 'venv');
    const wheelPath = path.join(extensionDir, 'repo_gpt-0.1.2-py3-none-any.whl');
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
	let apiKey = vscode.workspace.getConfiguration().get('openai.apiKey');
	if (!apiKey) {
		// Prompt the user to enter the API key if it's not set
		vscode.window.showInputBox({
			prompt: 'Please enter your OpenAI API Key:',
			placeHolder: 'API Key...'
		}).then(value => {
			if (value) {
				// Save the provided API key to the configuration
				vscode.workspace.getConfiguration().update('openai.apiKey', value, vscode.ConfigurationTarget.Global);
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

    context.subscriptions.push(vscode.commands.registerCommand('extension.runFunction', (functionName: string) => {
        vscode.window.showInformationMessage(`You triggered ${functionName}`);

        console.log(`Running function ${functionName}`);

        const language = "javascript";
        const code = functionName;
        const command = `${pythonInterpreter} explain --language ${language} --code ${code}`;
        try {
            // Capture the command's output.
            const output = execSync(command, { encoding: 'utf8' });
    
            // Display the command's output.
            vscode.window.showInformationMessage(`Output: ${output}`);
        } catch (error: any) {
            // If there's an error during command execution, display the error message.
            vscode.window.showErrorMessage(`Error: ${error.message}`);
        }
    }));

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from repo-gpt!');
	});

	context.subscriptions.push(disposable);
}

class FunctionRunCodeLensProvider implements vscode.CodeLensProvider {
    private regex: RegExp | null;
    private bodyRegex: RegExp | null;

    constructor(private language: string) {
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
                this.bodyRegex = /def \w+\s?\([^)]*\):\s*([\s\S]*?)(?=^\w|$)/gm;
                break;
			default:
				this.regex = null;
				this.bodyRegex = null;
        }
    }

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        let matches;
        const codeLenses: vscode.CodeLens[] = [];

		if (this.regex === null || this.bodyRegex === null) {
			return codeLenses;
		}

        while (matches = this.regex.exec(document.getText())) {
            const functionName = matches[1];
            const line = document.lineAt(document.positionAt(matches.index).line);
            const command: vscode.Command = {
                title: "Run function",
                command: "extension.runFunction",
                arguments: [document.getText(), functionName, this.bodyRegex]
            };
            codeLenses.push(new vscode.CodeLens(line.range, command));
        }

        return codeLenses;
    }
}


// This method is called when your extension is deactivated
export function deactivate() {}