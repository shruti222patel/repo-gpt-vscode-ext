1. `nvm use --lts`
2. `vsce package`
   1. This will create a `.vsix` file in your directory. 
3. Right click the generated `.vsix` file and click "Install from VSIX...".


If you've followed the above steps and are still facing the issue, it could be helpful to see if there's any detailed logging available. Sometimes, VS Code provides more specific errors in its console. You can access this by pressing Ctrl+Shift+U (or Cmd+Shift+U on macOS) to bring up the Output panel and selecting "Log (Extension Host)" from the dropdown.


## Helpful Resources
- [Create Q&A chatbot](https://community.openai.com/t/context-generation-for-chat-based-q-a-bot/103121/18)
- [Example chatbot vscode ext ui](https://github.com/barnesoir/chatgpt-vscode-plugin)