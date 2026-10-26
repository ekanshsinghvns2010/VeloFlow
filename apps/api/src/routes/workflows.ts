const suppliedDefinition = body.data.definition ?? {
  name,
  description,
  nodes: [],
  connections: [],
  settings: {},
  active: false,
  version: 1
};