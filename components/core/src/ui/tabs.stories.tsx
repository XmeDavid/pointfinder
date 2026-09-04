import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta: Meta<typeof Tabs> = { title: "Core/Tabs", component: Tabs };
export default meta;
type Story = StoryObj<typeof Tabs>;

export const Playground: Story = {
  render: () => {
    const [value, setValue] = useState("bases");
    return (
      <Tabs value={value} onValueChange={setValue} className="w-96">
        <TabsList>
          <TabsTrigger value="bases">Bases</TabsTrigger>
          <TabsTrigger value="challenges">Challenges</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
        </TabsList>
        <TabsContent value="bases"><p className="p-4 text-sm">12 bases, 10 linked to tags.</p></TabsContent>
        <TabsContent value="challenges"><p className="p-4 text-sm">14 challenges.</p></TabsContent>
        <TabsContent value="teams"><p className="p-4 text-sm">4 teams.</p></TabsContent>
      </Tabs>
    );
  },
};
