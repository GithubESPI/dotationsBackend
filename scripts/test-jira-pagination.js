/**
 * Script de test pour comprendre les paramètres de pagination de l'API Jira Assets AQL
 * 
 * PROBLÈME IDENTIFIÉ:
 * - L'API retourne toujours 25 objets malgré resultPerPage=100
 * - Besoin de tester différents paramètres pour trouver le bon
 * 
 * PARAMÈTRES À TESTER:
 * 1. resultPerPage (actuellement utilisé - ne fonctionne pas)
 * 2. maxResults
 * 3. pageSize  
 * 4. limit
 * 5. top
 * 
 * DOCUMENTATION JIRA ASSETS:
 * - Endpoint: POST /object/aql
 * - La limite par défaut semble être 25
 * - Besoin de trouver le paramètre correct pour augmenter cette limite
 */

// Test 1: Paramètres actuels (ne fonctionne pas)
const test1 = {
    qlQuery: 'objectSchema = "Parc Informatique" AND objectType = "Laptop"',
    page: 1,
    resultPerPage: 100
};

// Test 2: Avec maxResults
const test2 = {
    qlQuery: 'objectSchema = "Parc Informatique" AND objectType = "Laptop"',
    page: 1,
    maxResults: 100
};

// Test 3: Avec pageSize
const test3 = {
    qlQuery: 'objectSchema = "Parc Informatique" AND objectType = "Laptop"',
    page: 1,
    pageSize: 100
};

// Test 4: Avec limit
const test4 = {
    qlQuery: 'objectSchema = "Parc Informatique" AND objectType = "Laptop"',
    page: 1,
    limit: 100
};

// Test 5: Avec top (style OData)
const test5 = {
    qlQuery: 'objectSchema = "Parc Informatique" AND objectType = "Laptop"',
    page: 1,
    top: 100
};

// Test 6: Sans pagination (voir la limite par défaut)
const test6 = {
    qlQuery: 'objectSchema = "Parc Informatique" AND objectType = "Laptop"'
};

/**
 * SOLUTION ALTERNATIVE:
 * Si aucun paramètre ne fonctionne, nous devrons:
 * 1. Accepter la limite de 25 par page
 * 2. Faire plus de requêtes (381 / 25 = ~16 pages)
 * 3. Utiliser la pagination avec page=1, page=2, etc.
 */
