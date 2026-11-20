import { configure } from '@testing-library/react';

// Sob carga (vários arquivos em paralelo), o 1 s padrão dos findBy* é pouco.
configure({ asyncUtilTimeout: 4000 });
