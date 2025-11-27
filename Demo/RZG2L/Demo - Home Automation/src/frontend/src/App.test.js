import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom"; // 👈 add this
import App from "./App";

test("renders the heading", () => {
  render(<App />);
  expect(
    screen.getByRole("heading", { name: /smart home user login/i })
  ).toBeInTheDocument();
});

// import { render, screen } from "@testing-library/react";
// import "@testing-library/jest-dom"; // ✅ ensures toBeInTheDocument() works
// import App from "./App";

// test("renders the heading", () => {
//   render(<App />);
//   const heading = screen.getByRole("heading", { name: /smart home user login/i }).toBeInTheDocument();
// });