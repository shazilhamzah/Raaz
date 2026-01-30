/** @type {import('tailwindcss').Config} */
module.exports = {
    // NOTE: Update this to include the paths to all of your component files.
    content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
    presets: [require("nativewind/preset")],
    theme: {
        extend: {
            colors: {
                primary: '#0F2854',   // Dark Blue (Backgrounds)
                secondary: '#1C4D8D', // Medium Blue (Cards)
                accent: '#4988C4',    // Light Blue (Inputs/Buttons)
                highlight: '#BDE8F5', // Pale Blue (Text/Icons)
            },
            fontFamily: {
                matanya: ['Matanya'],
            },
        },
    },
    plugins: [],
}
