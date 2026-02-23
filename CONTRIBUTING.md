# Contributing to adrex

We welcome contributions to the adrex project. Whether it's reporting a bug, improving documentation, or submitting a pull request, your help is appreciated.

## Development Environment Setup

To set up a local development environment, follow these steps:

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   cd widget && npm install && cd ..
   ```
3. Start the infrastructure (Meilisearch) using Docker:
   ```bash
   docker compose up -d
   ```
4. Run the data pipeline to import address points (this may take several minutes):
   ```bash
   npm run pipeline
   ```
5. Start the development servers:
   - API: `npm run dev`
   - Widget: `npm run widget:dev`

## Pull Request Process

1. Fork the repository and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. Ensure the project builds and type-checks:
   ```bash
   npm run typecheck
   npm run build
   npm run widget:build
   ```
4. Update the documentation if you've changed any API contracts or configuration options.
5. Submit a pull request with a clear description of the changes.

## Code Style

- Use TypeScript for all new code.
- Follow the existing coding patterns and project structure.
- Ensure strict type checking passes.
- Keep the widget footprint small and avoid large dependencies.

## Reporting Bugs

Please use GitHub Issues to report bugs or request new features. Provide as much detail as possible, including steps to reproduce and any relevant environment information.
