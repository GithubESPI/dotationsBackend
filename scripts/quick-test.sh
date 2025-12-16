#!/bin/bash
# Script rapide pour tester la connexion Azure AD

echo "🔐 Test rapide de connexion Azure AD"
echo "======================================"
echo ""
echo "1. Assurez-vous que l'application est démarrée :"
echo "   pnpm run start:dev"
echo ""
echo "2. Ouvrez votre navigateur et allez sur :"
echo "   http://localhost:3000/auth/azure-ad"
echo ""
echo "3. Connectez-vous avec :"
echo "   Email: dev@groupe-espi.fr"
echo "   Mot de passe: espi2077*"
echo ""
echo "4. Après la connexion, vous recevrez un token JWT."
echo ""
echo "5. Testez le profil avec :"
echo "   curl -X GET http://localhost:3000/auth/profile \\"
echo "     -H \"Authorization: Bearer YOUR_TOKEN\""
echo ""

