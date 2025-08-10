# llm-gen

A CLI tool to extract readable text from static HTML files (e.g., Next.js static exports) and generate an `llm.txt` file optimized for ingestion by Large Language Models (LLMs). It also supports generating a JSON metadata file (`pages.json`) and an optional interactive HTML UI (`llm_ui.html`) for browsing extracted content.

## Features

- **Text Extraction**: Extracts clean, readable text from HTML files using Cheerio, removing noise like scripts, styles, and hidden elements.
- **Concurrent Processing**: Processes multiple HTML files concurrently with configurable concurrency limits for performance.
- **Output Formats**:
  - `llm.txt`: A single text file with extracted content, organized with file headers and a table of contents.
  - `pages.json`: Metadata about processed files, including file paths, sizes, text lengths, and SHA-256 hashes.
  - `llm_ui.html` (optional): An interactive HTML interface for browsing extracted text with search functionality.
- **Customizable**: Supports glob patterns for file selection, configurable output directories, and verbosity options.
- **Efficient**: Uses streaming for large file outputs and handles errors gracefully.
- **MIT Licensed**: Free to use, modify, and distribute.

## Installation

Install `llm-gen` globally via npm for CLI access, or locally for use in scripts:

```bash
# Install globally
npm install -g llm-gen

# Or install locally in a project
npm install llm-gen
```

### Prerequisites

- **Node.js**: Version 18 or higher (uses ES Modules and modern JavaScript features).
- **npm**: For installing dependencies.

## Usage

Run `llm-gen` from the command line, specifying the source directory containing HTML files (e.g., a Next.js static export in the `out` directory).

### Basic Command

```bash
llm-gen --src ./out
```

This processes all HTML files (`*.html`, `*.htm`) in the `./out` directory, generating:
- `llm.txt`: Extracted text with a table of contents.
- `pages.json`: Metadata about processed files.

### Options

| Option          | Description                                                                 | Type    | Default            |
|-----------------|-----------------------------------------------------------------------------|---------|--------------------|
| `--src`         | Source directory containing HTML files to process (required).               | String  | None               |
| `--public`      | Output directory for generated files (`llm.txt`, `pages.json`, `llm_ui.html`). | String  | `.` (current dir)  |
| `--out`         | Output filename for the extracted text (relative to `--public`).            | String  | `llm.txt`          |
| `--ui`          | Generate an interactive HTML UI file (`llm_ui.html`).                       | Boolean | `false`            |
| `--concurrency` | Maximum number of files to process concurrently.                            | Number  | `10`               |
| `--verbose`     | Enable detailed logging of processing steps.                                | Boolean | `false`            |
| `--pattern`     | Glob pattern to match HTML files (relative to `--src`).                     | String  | `**/*.htm?(l)`     |
| `--help`        | Display help information.                                                  | -       | -                  |

### Example Commands

1. **Process HTML files in a Next.js `out` directory**:
   ```bash
   llm-gen --src ./out --public ./dist --out extracted.txt
   ```
   - Processes HTML files in `./out`.
   - Writes `extracted.txt` and `pages.json` to `./dist`.

2. **Generate an interactive UI**:
   ```bash
   llm-gen --src ./out --ui --verbose
   ```
   - Generates `llm.txt`, `pages.json`, and `llm_ui.html` in the current directory.
   - Logs detailed progress.

3. **Custom glob pattern with high concurrency**:
   ```bash
   llm-gen --src ./out --pattern "**/*.html" --concurrency 20 --public ./output
   ```
   - Processes only `*.html` files with up to 20 concurrent tasks.
   - Outputs to `./output`.

## Output Files

- **`llm.txt`**:
  - Contains extracted text from all HTML files, organized with headers for each file.
  - Includes a table of contents with file paths, sizes, and character counts.
  - Example structure:
    ```
    Generated: 2025-08-10T12:34:56.789Z
    Source directory: /path/to/out
    Files processed: 5

    ╔══════════════════════════════╤═══════╤═══════╗
    ║ File Path                    │ Size  │ Chars ║
    ╟──────────────────────────────┼───────┼───────┼
    ║ index.html                   │ 12345 │  5678 ║
    ║ about.html                   │  6789 │  2345 ║
    ╚══════════════════════════════╧═══════╧═══════╝
    Total files: 5
    Total characters: 12,345

    ════════════════════════════════════════════════════════════════════════════════
     📄 FILE: index.html
    ════════════════════════════════════════════════════════════════════════════════
    Welcome to our website! This is the home page content...
    ```

- **`pages.json`**:
  - Metadata about processed files in JSON format.
  - Includes file paths, sizes, text lengths, SHA-256 hashes, and any errors.
  - Example:
    ```json
    {
      "generatedAt": "2025-08-10T12:34:56.789Z",
      "source": "/path/to/out",
      "pages": [
        {
          "path": "index.html",
          "size": 12345,
          "textLength": 5678,
          "hash": "a1b2c3d4...",
          "error": null
        }
      ]
    }
    ```

- **`llm_ui.html`** (if `--ui` is enabled):
  - An interactive HTML page for browsing extracted text.
  - Features a search bar to filter files by path or content.
  - Collapsible sections for each file with a text preview.
  - Note: Full-text display for large files is not implemented (displays a placeholder alert).

## Development

### Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/Agecoder/llm-gen.git
cd llm-gen
npm install
```

### Scripts

- `npm start`: Run the CLI with default arguments (`--src ./out`).
- `npm run build`: Run the CLI with `./out` as the source directory.
- `npm run dev`: Run the CLI in watch mode for development.
- `npm run lint`: Lint the codebase using ESLint.
- `npm run format`: Format the codebase using Prettier.

### Dependencies

- **cheerio**: HTML parsing for text extraction.
- **fs-extra**: Enhanced file system operations.
- **glob**: File pattern matching.
- **p-limit**: Concurrency control for file processing.
- **yargs**: Command-line argument parsing.

### Dev Dependencies

- **eslint**: Linting for code quality.
- **prettier**: Code formatting.

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/your-feature`).
3. Commit your changes (`git commit -m "Add your feature"`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Open a pull request.

Please ensure your code passes linting (`npm run lint`) and is formatted (`npm run format`).

## License

This project is licensed under the [MIT License](LICENSE).

## Author

- **Vedant Navale**
- Email: vedantnavaleone@gmail.com
- GitHub: [Agecoder](https://github.com/Agecoder)

## Issues

Report bugs or suggest features at [GitHub Issues](https://github.com/Agecoder/llm-gen/issues).

## Acknowledgments

- Built with inspiration from static site generation workflows and LLM content ingestion needs.
- Thanks to the open-source community for providing robust libraries like Cheerio and yargs.