param(
    [string]$Output = 'dist\dwss-convertor-cli.exe'
)

$ErrorActionPreference = 'Stop'
bun build .\src\cli.ts --compile --target bun-windows-x64 --outfile $Output
