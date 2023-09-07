import * as vscode from 'vscode';
import { spawn } from 'child_process';
import ChatGptViewProvider from './chatgpt-view-provider';
import { PythonProcessHandler } from './PythonProcessHandler';
import { FunctionRunCodeLensProvider } from './FunctionRunCodeLensProvider';

const fs = require('fs');
const { execSync } = require('child_process');
const os = require('os');
const path = require('path');



export function setupPythonEnv(context: vscode.ExtensionContext) {
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
    const chatViewProvider = new ChatGptViewProvider(context, context.extensionPath, pythonInterpreter, apiKey);
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

    // Create tests
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


    // Explain
    context.subscriptions.push(vscode.commands.registerCommand('repogpt.explain', (functionBody: string, functionName: string, language: string) => {
        chatViewProvider.sendMessageToWebView(createWebViewMessage({ action: 'explain', type: 'clear', language: language, value: "" }));
        pythonHandler.runPythonScript('explain_code.py', functionBody, functionName, language, 'Explanation of');
    }));
    
    // Refactor
    context.subscriptions.push(vscode.commands.registerCommand('repogpt.refactor', (functionBody: string, functionName: string, language: string) => {
        chatViewProvider.sendMessageToWebView(createWebViewMessage({ 
            action: 'refactor', type: 'clear', language: language, value: "" 
        }));
        chatViewProvider.sendMessageToWebView(createWebViewMessage({ 
            action: 'refactor',
            type: 'addResponse', 
            language: language, 
            value: "List aspects you'd like refactored. If you want a generic refactoring, leave the input empty and press enter.", 
            showInputBox: true,
            functionName: functionName,
            functionBody: functionBody,
        }));
    }));
}


interface WebViewMessage {
    id: string;
    action: string,
    type: string;
    value: string;
    stream: object;
    isError?: boolean;
    language?: string;
    inProgress?: boolean;  // The "?" makes it optional
    showInputBox: boolean;
    functionBody: string | null;
    functionName: string | null;
}
export function createWebViewMessage(message: Partial<WebViewMessage>): WebViewMessage {
    // Set default values
    const defaults: WebViewMessage = {
        id: 'random-id',
        action: 'generic', // Can be 'refactor', 'explain'
        type: '',
        value: '',
        stream: {text:'', newDataStartIndex:0, isError:false},
        language: 'javascript',
        isError: false,
        inProgress: false,
        showInputBox: false,
        functionBody: null,
        functionName: null,
    };

    return { ...defaults, ...message };
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
