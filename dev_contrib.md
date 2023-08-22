1. `nvm use --lts`
2. `vsce package`
   1. This will create a `.vsix` file in your directory. 
   2. You can then install this file directly in VS Code using the "Install from VSIX..." option available in the Extensions view.
3. Make changes to your extension's code in the main VS Code window. Reload the Extension Development Host to see your changes by pressing Ctrl+R (Windows/Linux) or Cmd+R (macOS).


If you've followed the above steps and are still facing the issue, it could be helpful to see if there's any detailed logging available. Sometimes, VS Code provides more specific errors in its console. You can access this by pressing Ctrl+Shift+U (or Cmd+Shift+U on macOS) to bring up the Output panel and selecting "Log (Extension Host)" from the dropdown.