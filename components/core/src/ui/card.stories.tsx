import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";

const meta: Meta<typeof Card> = { title: "Core/Card", component: Card };
export default meta;
type Story = StoryObj<typeof Card>;

export const Playground: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Granite boulder</CardTitle>
        <CardDescription>Checked in 09:50 · Falcons</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">How many carved initials are on the north face?</p>
      </CardContent>
      <CardFooter className="justify-between">
        <Badge variant="info">Checked in</Badge>
        <Button size="sm">Answer</Button>
      </CardFooter>
    </Card>
  ),
};
