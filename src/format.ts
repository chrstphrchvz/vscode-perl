import * as vscode from "vscode";
import * as cp from "child_process";

export class PerlFormattingProvider implements vscode.DocumentRangeFormattingEditProvider {
    public async provideDocumentRangeFormattingEdits(
        document: vscode.TextDocument,
        range: vscode.Range,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): Promise<vscode.TextEdit[]> {
        // if perltidy is not defined, then skip the formatting
        if (!vscode.workspace.getConfiguration("perl").get("perltidy")) {
            return [];
        }

        return new Promise<vscode.TextEdit[]>((resolve, reject) => {
            if (range.start.line !== range.end.line) {
                range = range.with(
                    range.start.with(range.start.line, 0),
                    range.end.with(range.end.line, Number.MAX_VALUE)
                );
            }

            let config = vscode.workspace.getConfiguration("perl");

            let executable = config.get("perltidy", "perltidy");
            let args = config.get("perltidyArgs", [
                "-q",
                "-et=4",
                "-t",
                "-ce",
                "-l=0",
                "-bar",
                "-naws",
                "-blbs=2",
                "-mbl=2",
            ]);
            let container = config.get("perltidyContainer", "");
            if (container !== "") {
                args = ["exec", "-i", container, executable].concat(args);
                executable = "docker";
            }

            let text = document.getText(range);
            let child = cp.spawn(executable, args);
            child.stdin.write(text);
            child.stdin.end();

            let stdout = "";
            child.stdout.on("data", (out: Buffer) => {
                stdout += out.toString();
            });

            let stderr = "";
            child.stderr.on("data", (out: Buffer) => {
                stderr += out.toString();
            });

            let error: Error;
            child.on("error", (err: Error) => {
                error = err;
            });

            child.on("close", (code, signal) => {
                let message = "";

                if (error) {
                    message = error.message;
                } else if (stderr) {
                    message = stderr;
                } else if (code !== 0) {
                    message = stdout;
                }

                if (code !== 0) {
                    message = message.trim();
                    let formatted = `Could not format, code: ${code}, error: ${message}`;
                    reject(formatted);
                } else {
                    if (!text.endsWith("\n")) {
                        stdout = stdout.slice(0, -1); // remove trailing newline
                    }
                    resolve([new vscode.TextEdit(range, stdout)]);
                }
            });
        }).catch(reason => {
            console.error(reason);
            return [];
        });
    }
}
