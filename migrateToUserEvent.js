export default (fileInfo, api) => {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  const moduleHasUserEventImport = () => !!root.find(j.ImportDeclaration, {
    source: { value: '@testing-library/user-event' },
  }).length;

  const createUserEventImport = () => {
    const source = {
      type: 'Literal',
      value: '@testing-library/user-event',
    };
    const specifiers = [{ type: 'ImportDefaultSpecifier', local: { type: 'Identifier', name: 'userEvent' } }];
    return j.importDeclaration(specifiers, source);
  };

  // remove fireEvent imports and replace with userEvent
  root.find(j.ImportDeclaration, {
    source: { value: '@testing-library/react' },
  })
    .replaceWith((path) => {
      if (path.node.specifiers.length === 1 && path.node.specifiers[0].local.name === 'fireEvent') {
        delete path.node;
        if (!moduleHasUserEventImport()) {
          return createUserEventImport();
        }
      } else {
        root.find(j.ImportSpecifier, { imported: { type: 'Identifier', name: 'fireEvent' } }).remove();
        if (!moduleHasUserEventImport()) {
          path.parentPath.unshift(createUserEventImport());
        }
        return path.node;
      }
    });

  root.find(j.CallExpression, { callee: { object: { name: 'fireEvent' } } })
    .map((path) => {
      switch (path.node.callee.property.name) {
        case 'change': {
          const argument = path.get('arguments').value;
          if (argument.length === 2 && argument[1].type === 'ObjectExpression') {
            const property = argument[1].properties[0];

            if (property.value.type === 'ObjectExpression') {
              const { value } = property.value.properties[0];
              const { key } = property.value.properties[0];
              if (value.type === 'Literal' && key.name === 'value') {
                path.node.arguments[1] = j.stringLiteral(value.value);
                path.node.callee.property.name = 'type';
              } else if (
                value.type === 'ArrayExpression'
              && key.name === 'files'
              ) {
                const variable = j.identifier('File');
                const file = j.newExpression(variable, [value]);
                path.node.arguments[1] = file;
                path.node.callee.property.name = 'upload';
              }
            }
          }
          break;
        }
        default: {
          return null;
        }
      }
    });

  // replace all fireEvent calls by useEvent
  root.find(j.Identifier, { name: 'fireEvent' }).map((path) => {
    path.node.name = 'userEvent';
  });

  return root.toSource();
};
