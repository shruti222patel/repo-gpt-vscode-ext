1. `nvm use --lts`
2. `vsce package`
   1. This will create a `.vsix` file in your directory. 
3. Right click the generated `.vsix` file and click "Install from VSIX...".


If you've followed the above steps and are still facing the issue, it could be helpful to see if there's any detailed logging available. Sometimes, VS Code provides more specific errors in its console. You can access this by pressing Ctrl+Shift+U (or Cmd+Shift+U on macOS) to bring up the Output panel and selecting "Log (Extension Host)" from the dropdown.


### Debugging
1. Run extension using the debugger or press `F5`
2. Open the command palette (Ctrl+Shift+P) in the extension and `Run the Developer: Open Webview Developer Tools` command.

## Helpful Resources
- [Create Q&A chatbot](https://community.openai.com/t/context-generation-for-chat-based-q-a-bot/103121/18)
- [Example chatbot vscode ext ui](https://github.com/barnesoir/chatgpt-vscode-plugin)

### CSS Loading Spinners
- [simple triangle](https://codepen.io/alphardex/pen/JjYVoqm)
- [gradient circle](https://codepen.io/sam_garcia2/pen/abvVEae)
- [two dots](https://codepen.io/meowwwls/pen/OJJPbGb)
- [cute cat](https://codepen.io/jkantner/pen/jOONyoO)
- [gradient circle](https://codepen.io/AdamDipinto/pen/eYOaGvY)
- 

### Buttons
- https://codepen.io/paulkoeckdev/pen/MWmvbJK
- [Rainbow Border]()
- [Gradient](https://tailwindcomponents.com/component/fancy-button-with-icon)
- [Animated Gradient Border](https://www.hyperui.dev/blog/animated-border-gradient-with-tailwindcss)
- [Tailwind animated gradient](https://codepen.io/rishi111/pen/JjLJEOp)


## TODO
[ ] Check tokensize of function -- only show codelens options for functions that have the correct tokensize
[ ] Offer a way for users a way to select and refactor text (useful for large functions)
[ ] Add linter
[ ] Improve chat UI/ layout (https://dev.to/rallipi/build-a-mobile-chat-layout-with-tailwindcss-4dk)
[ ] Add buttons for easy answers to refactoring code