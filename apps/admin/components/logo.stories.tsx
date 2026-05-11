import type { Meta, StoryObj } from "@storybook/nextjs";
import type { ComponentType } from "react";
import { ThemeProvider } from "next-themes";
import { Logo } from "./logo";

const meta = {
  title: "UI/Logo",
  component: Logo,
  decorators: [
    (Story: ComponentType) => (
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <div className="rounded-xl border border-slate-200 bg-white p-8">
          <Story />
        </div>
      </ThemeProvider>
    )
  ]
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof Logo>;

export const Default: Story = {};
export const Compact: Story = { args: { compact: true } };
