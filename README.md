# AMC Showtimes Planner

A React web app to view and filter AMC movie showtimes for the week, inspired by the AMC website's look but with a more user-friendly overview. Built for AMC A-List users to maximize their movie planning.

## Features
- Black/white AMC-inspired design
- Filter by theater and date (multi-select)
- Movie cards with poster, title, runtime, and showtimes
- Loads showtimes from a CSV file (updated daily)
- Ready for GitHub Pages deployment

## Getting Started
1. `npm install`
2. `npm run dev` (for local development)
3. `npm run deploy` (to deploy to GitHub Pages)

Place your `showtimes.csv` in the `public/` directory.

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
