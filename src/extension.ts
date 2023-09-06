import * as vscode from 'vscode';
import { spawn } from 'child_process';
import ChatGptViewProvider from './chatgpt-view-provider';

const fs = require('fs');
const { execSync } = require('child_process');
const os = require('os');
const path = require('path');



function setupPythonEnv(context: vscode.ExtensionContext) {
    const extensionDir = context.extensionPath;
    const venvDir = path.join(extensionDir, 'venv');
    const wheelPath = path.join(extensionDir, 'repo_gpt-0.1.6-py3-none-any.whl');
    const lastWheelPath = path.join(extensionDir, 'last_wheel.txt');
    const pythonInterpreter = path.join(venvDir, 'bin', 'python');

    // Check the existence of the python interpreter
    if (!fs.existsSync(pythonInterpreter) || 
        !fs.existsSync(lastWheelPath) || 
        fs.readFileSync(lastWheelPath, 'utf8') !== path.basename(wheelPath)) {

        // Remove existing venv directory if it exists
        if (fs.existsSync(venvDir)) {
            console.log(`Removing existing virtual environment at: ${venvDir}`);
            fs.rmSync(venvDir, { recursive: true });
        }

        // Create a new virtual environment
        try {
            console.log(`Creating virtual environment at: ${venvDir}`);
            execSync(`python3 -m venv ${venvDir}`);
            console.log(`Virtual environment created.`);
        } catch (error) {
            console.error(`Error creating virtual environment: ${error}`);
            return null; // Return null to indicate failure
        }

        // Install the wheel package into the virtual environment
        try {
            console.log(`Installing wheel package from: ${wheelPath}`);
            execSync(`${path.join(venvDir, 'bin', 'pip')} install ${wheelPath}`);
            console.log(`Wheel package installed.`);
        } catch (error) {
            console.error(`Error installing wheel package: ${error}`);
            return null; // Return null to indicate failure
        }

        // Store the current wheel filename
        fs.writeFileSync(lastWheelPath, path.basename(wheelPath));
    }

    // Check the existence of python interpreter after setup
    if (fs.existsSync(pythonInterpreter)) {
        console.log(`Python interpreter exists at: ${pythonInterpreter}`);
    } else {
        console.log(`Python interpreter NOT found at: ${pythonInterpreter}`);
        return null; // Return null to indicate failure
    }

    return pythonInterpreter;
}


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Check if API key is set
	let apiKey: string | undefined = vscode.workspace.getConfiguration('repogpt').get('openaiApiKey');
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
    if (!apiKey) {
        vscode.window.showErrorMessage('Please set your OpenAI API Key in the settings');
        return;
    }

    const pythonInterpreter = setupPythonEnv(context);


    // REGISTER SUBSCRIOTIONS
    // Register ChatGptViewProvider for all languages
    const chatViewProvider = new ChatGptViewProvider(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("repogpt.view", chatViewProvider, {
        webviewOptions: { retainContextWhenHidden: true }
    }));
    // console.log("registered webview view provider");

	// Register FunctionRunCodeLensProvider for all languages
	const languages = ['typescript', 'php', 'python', 'sql'];
    const codeLensProviders: FunctionRunCodeLensProvider[] = [];

    for (const lang of languages) {
        const provider = new FunctionRunCodeLensProvider(lang, context);
        codeLensProviders.push(provider);
        
        context.subscriptions.push(vscode.languages.registerCodeLensProvider(
            { scheme: 'file', language: lang },
            provider
        ));
    }

    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document === vscode.window.activeTextEditor?.document) {
            const docLanguage = e.document.languageId;
            for (const provider of codeLensProviders) {
                if (provider.language === docLanguage) {
                    provider.refresh();  // Refresh only the relevant codelens for the updated document's language
                    break;
                }
            }
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('repogpt.createTest', async (functionBody: string, originalFilePath: string, language: string) => {
        const outputFileName = 'demo_generated_tests.txt';
        const outputFilePath = path.join(path.dirname(originalFilePath), outputFileName);
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
    
            // Construct the command
            const pythonProcess = spawn(pythonInterpreter, [pythonScriptPath, apiKey, language, testFramework, tempFilePath, outputFilePath]);
        
            // If you want to report progress from the pythonProcess (optional), 
            // you could listen to its stdout/stderr and call progress.report as needed.
            
            // Clear previous text
            chatViewProvider.sendMessageToWebView(createWebViewMessage({ type: 'clear',language: language, value: "" }));
            chatViewProvider.sendMessageToWebView(createWebViewMessage({ type: 'addResponse',language: language, value: 'Generating tests...this will take some time', inProgress: true }));
        
            // Handle process completion
            return new Promise((resolve, reject) => {
                pythonProcess.on('close', resolve);
                pythonProcess.on('error', reject);
            });
        });
    
        vscode.window.showInformationMessage('Finished generating tests!');
        chatViewProvider.sendMessageToWebView(createWebViewMessage({ type: 'addResponse',language: language, value: `Tests have been generated at ${outputFilePath}` }));
    }));

    // Usage
    const pythonHandler = new PythonProcessHandler(context.extensionPath, pythonInterpreter, apiKey, chatViewProvider);
    
    context.subscriptions.push(vscode.commands.registerCommand('repogpt.explain', (functionBody: string, functionName: string, language: string) => {
        pythonHandler.runPythonScript('explain_code.py', functionBody, functionName, language, 'Explanation of');
    }));
    
    context.subscriptions.push(vscode.commands.registerCommand('repogpt.refactor', (functionBody: string, functionName: string, language: string) => {
        pythonHandler.runPythonScript('refactor_code.py', functionBody, functionName, language, 'Refactor');
    }));
}


interface WebViewMessage {
    type: string;
    value: string;
    stream: object;
    isError?: boolean;
    language?: string;
    inProgress?: boolean;  // The "?" makes it optional
}
function createWebViewMessage(message: Partial<WebViewMessage>): WebViewMessage {
    // Set default values
    const defaults: WebViewMessage = {
        type: '',
        value: '',
        stream: {text:'', newDataStartIndex:0, isError:false},
        language: 'javascript',
        isError: false,
        inProgress: false,
    };

    return { ...defaults, ...message };
}

class FunctionRunCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor(public language: string, private context: vscode.ExtensionContext) {}

    // This function will be called whenever we want to refresh the codelens
    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
    
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
            // code: string;
            start_line: number;
            end_line: number;
        };

        try {
            const codelensArr: ParsedCodeLens[] = JSON.parse(codelensStr);
            for (const parsedCodeLens of codelensArr) {
                // const line = document.lineAt(code.start_line);
                const range = new vscode.Range(parsedCodeLens.start_line, 0, parsedCodeLens.end_line+1, 0);
                const code = document.getText(range);
                const explainCommand: vscode.Command = {
                    title: "Explain",
                    command: "repogpt.explain",
                    arguments: [code , parsedCodeLens.name, this.language]
                };
                codeLenses.push(new vscode.CodeLens(range, explainCommand));

                const refactorCommand: vscode.Command = {
                    title: "Refactor",
                    command: "repogpt.refactor",
                    arguments: [code , parsedCodeLens.name, this.language]
                };
                codeLenses.push(new vscode.CodeLens(range, refactorCommand));

                if (this.language !== 'sql') {
                    const createTestCommand: vscode.Command = {
                        title: "Create Test",
                        command: "repogpt.createTest",
                        arguments: [code , filepath, this.language]
                    };
                    codeLenses.push(new vscode.CodeLens(range, createTestCommand));
                }
            }
        } catch (error) {
            console.error("Error parsing the string into JSON:", error);
        }
        return codeLenses;
    }
}

class PythonProcessHandler {
    private fullResponse: string = '';
    private fullError: string = '';

    constructor(private extensionDir: string, private pythonInterpreter: string, private apiKey: string, private chatViewProvider: any) {}

    runPythonScript(scriptName: string, functionBody: string, functionName: string, language: string, messageType: string) {
        const tempFilePath = path.join(os.tmpdir(), 'function_content.txt');
        fs.writeFileSync(tempFilePath, functionBody);

        const pythonScriptPath = path.join(this.extensionDir, 'python_scripts', scriptName);

        const pythonProcess = spawn(this.pythonInterpreter, [pythonScriptPath, this.apiKey, language, tempFilePath]);

        this.fullResponse = `## ${messageType}: ${functionName}\n`;

        this.chatViewProvider.sendMessageToWebView(createWebViewMessage({ type: 'clear', language: language, value: "" }));
        this.chatViewProvider.sendMessageToWebView(createWebViewMessage({ type: 'addResponse', language: language, inProgress: true }));
        
        this.chatViewProvider.sendMessageToWebView(createWebViewMessage({ type: 'append', language: language, stream: {text:this.fullResponse, newDataStartIndex:0}, inProgress: true }));

        pythonProcess.stdout.on('data', (data) => {
            console.log("Response data as read from terminal process", data.toString());
            const newDataStartIndex = this.fullResponse.length;
            this.fullResponse += data.toString();
            this.chatViewProvider.sendMessageToWebView(createWebViewMessage({ type: 'append', language: language, stream: {text:this.fullResponse, newDataStartIndex:newDataStartIndex}, inProgress: true }));
        });

        pythonProcess.stderr.on('data', (data) => {
            const newDataStartIndex = this.fullError.length;
            this.fullError += data.toString();
            this.chatViewProvider.sendMessageToWebView(createWebViewMessage({ type: 'append', language: language, stream: {text:this.fullError, newDataStartIndex:newDataStartIndex, isError: true}, isError: true, inProgress: true }));
        });

        pythonProcess.on('close', (code) => {
            this.chatViewProvider.sendMessageToWebView(createWebViewMessage({ type: 'appendDone', language: language, value: "" }));
        });
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
                fs.rmSync(venvDir, { recursive: true });
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
