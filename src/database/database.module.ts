import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const mongoUri = configService.get<string>('MONGODBURI');
        
        if (!mongoUri) {
          throw new Error(
            'MONGODBURI est manquant dans les variables d\'environnement. ' +
            'Veuillez configurer MONGODBURI dans votre fichier .env'
          );
        }

        // Vérifier que l'URI contient authSource=admin pour l'authentification root
        let finalUri = mongoUri;
        if (!finalUri.includes('authSource=')) {
          // Ajouter authSource=admin si non présent
          const separator = finalUri.includes('?') ? '&' : '?';
          finalUri = `${finalUri}${separator}authSource=admin`;
          console.warn('⚠️  authSource manquant dans MONGODBURI, ajout de authSource=admin');
        }

        console.log('✅ Connexion MongoDB configurée');
        console.log(`   URI: ${finalUri.replace(/\/\/.*@/, '//***:***@')}`); // Masquer les credentials

        return {
          uri: finalUri,
        };
      },
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}

